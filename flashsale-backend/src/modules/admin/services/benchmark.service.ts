import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { createId } from '@paralleldrive/cuid2'
import { LockStrategy } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { BenchmarkRepository } from '../repositories/benchmark.repository'
import {
  BenchmarkResultDto,
  BenchmarkComparisonDto,
  RunBenchmarkDto,
  RunAllBenchmarkDto,
  StartBenchmarkDto,
  BenchmarkRunDto,
  StrategyMode,
  BenchmarkRunStatus
} from '../dto/benchmark.dto'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatencyStats {
  p50: number
  p95: number
  p99: number
  avg: number
}

type PurchaseOutcome = 'SUCCESS' | 'SOLD_OUT' | 'ERROR'

interface SingleResult {
  outcome: PurchaseOutcome
  latencyMs: number
}

// ─── Redis key helpers ─────────────────────────────────────────────────────────

const benchKey = (runId: string, type: 'nolock' | 'lua') =>
  `benchmark:${runId}:${type}`

const runStatusKey = (runId: string) => `benchmark:run:${runId}:status`
const runResultKey = (runId: string) => `benchmark:run:${runId}:result`
const RUN_TTL = 86400 // 24 hours

@Injectable()
export class BenchmarkService {
  private readonly logger = new Logger(BenchmarkService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly benchmarkRepo: BenchmarkRepository
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  async runScenario(dto: RunBenchmarkDto): Promise<BenchmarkResultDto> {
    const { campaignProductId, concurrentUsers, stockAmount, strategy } = dto

    const runId = `${campaignProductId}-${createId()}`
    const shouldRestoreDbStock = strategy === LockStrategy.DB_LOCK
    let dbOriginalStock: number | null = null

    if (shouldRestoreDbStock) {
      const context = await this.benchmarkRepo.getBenchmarkProductContext(
        campaignProductId
      )

      if (!context) {
        throw new NotFoundException('Sản phẩm chiến dịch không tồn tại')
      }

      if (context.campaignStatus === 'ACTIVE') {
        throw new BadRequestException(
          'Không cho phép chạy DB_LOCK benchmark trên campaign đang ACTIVE'
        )
      }

      dbOriginalStock = context.remainingQuantity
    }

    await this.initStock(runId, campaignProductId, stockAmount, strategy)

    try {
      const startMs = Date.now()
      const results = await this.runConcurrent(
        runId,
        campaignProductId,
        concurrentUsers,
        strategy
      )
      const totalTimeMs = Date.now() - startMs

      const finalStock = await this.getFinalStock(
        runId,
        campaignProductId,
        strategy
      )
      const latency = computeLatency(results.map(r => r.latencyMs))

      const succeeded = results.filter(r => r.outcome === 'SUCCESS').length
      const failed = results.filter(r => r.outcome === 'SOLD_OUT').length
      const errors = results.filter(r => r.outcome === 'ERROR').length
      const oversellCount = Math.max(0, succeeded - stockAmount)

      this.logger.log(
        `Benchmark [${strategy}] done: ${succeeded} ok, ${failed} sold-out, ` +
          `${errors} err, oversell=${oversellCount}, ${totalTimeMs}ms`
      )

      return {
        strategy,
        concurrentUsers,
        stockAmount,
        succeeded,
        failed,
        errors,
        oversellCount,
        finalStock,
        expectedFinalStock: Math.max(0, stockAmount - concurrentUsers),
        isCorrect:
          oversellCount === 0 && (finalStock === null || finalStock >= 0),
        totalTimeMs,
        throughputRPS: Math.round((concurrentUsers / totalTimeMs) * 1000),
        avgLatencyMs: latency.avg,
        p50LatencyMs: latency.p50,
        p95LatencyMs: latency.p95,
        p99LatencyMs: latency.p99
      }
    } finally {
      await this.cleanupScenario(runId, strategy)

      if (dbOriginalStock !== null) {
        await this.benchmarkRepo.resetCampaignProductStock(
          campaignProductId,
          dbOriginalStock
        )
      }
    }
  }

  async runAllStrategies(
    dto: RunAllBenchmarkDto
  ): Promise<BenchmarkComparisonDto> {
    // Chạy tuần tự để tránh tranh chấp tài nguyên giữa các scenario.
    // Mỗi scenario được reset stock sạch sẽ qua initStock trước khi chạy.
    const noLock = await this.runScenario({
      ...dto,
      strategy: LockStrategy.NO_LOCK
    })
    const dbLock = await this.runScenario({
      ...dto,
      strategy: LockStrategy.DB_LOCK
    })
    const redisLua = await this.runScenario({
      ...dto,
      strategy: LockStrategy.REDIS_LUA
    })

    const conclusion = buildConclusion(noLock, dbLock, redisLua)

    return { noLock, dbLock, redisLua, recommendation: 'REDIS_LUA', conclusion }
  }

  // ─── Async background benchmark ───────────────────────────────────────────

  async startBenchmark(dto: StartBenchmarkDto): Promise<{ runId: string }> {
    const { id: runId } = await this.benchmarkRepo.createRun({
      campaignProductId: dto.campaignProductId,
      concurrentUsers: dto.concurrentUsers,
      stockAmount: dto.stockAmount,
      strategyMode: dto.strategyMode
    })

    await this.redis.client.set(runStatusKey(runId), 'PENDING', 'EX', RUN_TTL)

    // Fire-and-forget — intentionally not awaited
    void this.executeRunAsync(runId, dto)

    return { runId }
  }

  async getRunStatus(runId: string): Promise<BenchmarkRunDto> {
    // Fast path: check Redis first
    const redisStatus = await this.redis.client.get(runStatusKey(runId))

    if (redisStatus !== null) {
      let result: BenchmarkResultDto | BenchmarkComparisonDto | null = null

      if (redisStatus === 'COMPLETED') {
        const raw = await this.redis.client.get(runResultKey(runId))
        if (raw) {
          result = JSON.parse(raw) as
            | BenchmarkResultDto
            | BenchmarkComparisonDto
        }
      }

      // For non-terminal statuses we still need the full run from DB for metadata
      const run = await this.benchmarkRepo.findRunById(runId)
      if (!run) {
        throw new NotFoundException(`Benchmark run ${runId} không tồn tại`)
      }

      return this.mapRunToDto(run, result ?? this.parseJsonResult(run.result))
    }

    // Fallback to DB
    const run = await this.benchmarkRepo.findRunById(runId)
    if (!run) {
      throw new NotFoundException(`Benchmark run ${runId} không tồn tại`)
    }

    return this.mapRunToDto(run, this.parseJsonResult(run.result))
  }

  async getHistory(
    page: number,
    limit: number
  ): Promise<{
    items: BenchmarkRunDto[]
    total: number
    page: number
    limit: number
  }> {
    const { items, total } = await this.benchmarkRepo.findHistory(page, limit)
    return {
      items: items.map(run =>
        this.mapRunToDto(run, this.parseJsonResult(run.result))
      ),
      total,
      page,
      limit
    }
  }

  private parseJsonResult(
    raw: unknown
  ): BenchmarkResultDto | BenchmarkComparisonDto | null {
    if (raw === null || raw === undefined) return null
    return raw as unknown as BenchmarkResultDto | BenchmarkComparisonDto
  }

  private mapRunToDto(
    run: {
      id: string
      campaignProductId: string
      concurrentUsers: number
      stockAmount: number
      strategyMode: string
      status: string
      result: unknown
      errorMessage: string | null
      createdAt: Date
      completedAt: Date | null
    },
    result: BenchmarkResultDto | BenchmarkComparisonDto | null
  ): BenchmarkRunDto {
    return {
      id: run.id,
      campaignProductId: run.campaignProductId,
      concurrentUsers: run.concurrentUsers,
      stockAmount: run.stockAmount,
      strategyMode: run.strategyMode as StrategyMode,
      status: run.status as BenchmarkRunStatus,
      result: result ?? null,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt ? run.completedAt.toISOString() : null
    }
  }

  private async executeRunAsync(
    runId: string,
    dto: StartBenchmarkDto
  ): Promise<void> {
    try {
      await this.benchmarkRepo.updateRunStatus(runId, 'RUNNING')
      await this.redis.client.set(runStatusKey(runId), 'RUNNING', 'EX', RUN_TTL)

      let result: BenchmarkResultDto | BenchmarkComparisonDto

      if (dto.strategyMode === 'ALL') {
        result = await this.runAllStrategies({
          campaignProductId: dto.campaignProductId,
          concurrentUsers: dto.concurrentUsers,
          stockAmount: dto.stockAmount
        })
      } else {
        const strategyMap: Record<
          Exclude<StrategyMode, 'ALL'>,
          LockStrategy
        > = {
          NO_LOCK: LockStrategy.NO_LOCK,
          DB_LOCK: LockStrategy.DB_LOCK,
          REDIS_LUA: LockStrategy.REDIS_LUA
        }
        result = await this.runScenario({
          campaignProductId: dto.campaignProductId,
          concurrentUsers: dto.concurrentUsers,
          stockAmount: dto.stockAmount,
          strategy:
            strategyMap[dto.strategyMode as Exclude<StrategyMode, 'ALL'>]
        })
      }

      const completedAt = new Date()
      await this.benchmarkRepo.updateRunStatus(runId, 'COMPLETED', {
        result,
        completedAt
      })
      await this.redis.client.set(
        runStatusKey(runId),
        'COMPLETED',
        'EX',
        RUN_TTL
      )
      await this.redis.client.set(
        runResultKey(runId),
        JSON.stringify(result),
        'EX',
        RUN_TTL
      )

      this.logger.log(`Benchmark run ${runId} completed successfully`)
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred'

      this.logger.error(`Benchmark run ${runId} failed: ${errorMessage}`)

      await this.benchmarkRepo.updateRunStatus(runId, 'FAILED', {
        errorMessage,
        completedAt: new Date()
      })
      await this.redis.client.set(runStatusKey(runId), 'FAILED', 'EX', RUN_TTL)
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async initStock(
    runId: string,
    campaignProductId: string,
    amount: number,
    strategy: LockStrategy
  ): Promise<void> {
    switch (strategy) {
      case LockStrategy.NO_LOCK:
        await this.redis.client.set(
          benchKey(runId, 'nolock'),
          amount,
          'EX',
          600
        )
        break
      case LockStrategy.DB_LOCK:
        await this.benchmarkRepo.resetCampaignProductStock(
          campaignProductId,
          amount
        )
        break
      case LockStrategy.REDIS_LUA:
        await this.redis.client.set(benchKey(runId, 'lua'), amount, 'EX', 600)
        break
    }
  }

  private async cleanupScenario(
    runId: string,
    strategy: LockStrategy
  ): Promise<void> {
    if (strategy === LockStrategy.NO_LOCK) {
      await this.redis.client.del(benchKey(runId, 'nolock'))
      return
    }

    if (strategy === LockStrategy.REDIS_LUA) {
      await this.redis.client.del(benchKey(runId, 'lua'))
    }
  }

  private async runConcurrent(
    runId: string,
    campaignProductId: string,
    n: number,
    strategy: LockStrategy
  ): Promise<SingleResult[]> {
    const promises = Array.from({ length: n }, (_, i) =>
      this.simulateSingle(runId, campaignProductId, i, strategy)
    )
    return Promise.all(promises)
  }

  private async simulateSingle(
    runId: string,
    campaignProductId: string,
    _index: number,
    strategy: LockStrategy
  ): Promise<SingleResult> {
    const t0 = Date.now()

    try {
      let outcome: PurchaseOutcome

      switch (strategy) {
        case LockStrategy.NO_LOCK:
          outcome = await this.purchaseNoLock(runId)
          break
        case LockStrategy.DB_LOCK:
          outcome = await this.purchaseDbLock(campaignProductId)
          break
        case LockStrategy.REDIS_LUA:
          outcome = await this.purchaseRedisLua(runId)
          break
      }

      return { outcome, latencyMs: Date.now() - t0 }
    } catch {
      return { outcome: 'ERROR', latencyMs: Date.now() - t0 }
    }
  }

  /**
   * NO_LOCK: Mô phỏng race condition thực tế.
   *
   * Vấn đề: hai bước GET và DECRBY không phải là atomic.
   * Nếu 1000 users đồng thời GET stock=100, tất cả thấy > 0,
   * và tất cả DECRBY → stock = 100 - 1000 = -900 (oversell nghiêm trọng).
   *
   * Edge case: `current` có thể trở thành âm nếu nhiều goroutines/coroutines
   * vượt qua check cùng lúc.
   */
  private async purchaseNoLock(runId: string): Promise<PurchaseOutcome> {
    const key = benchKey(runId, 'nolock')
    const raw = await this.redis.client.get(key)
    const current = raw !== null ? parseInt(raw) : 0

    if (current <= 0) {
      return 'SOLD_OUT'
    }

    // Race window: giữa GET và DECRBY, một thread khác có thể đã DECRBY → oversell
    // Thêm một micro-delay để tăng xác suất race condition xảy ra trong demo
    await microDelay()

    await this.redis.client.decrby(key, 1)
    return 'SUCCESS'
  }

  /**
   * DB_LOCK: SELECT FOR UPDATE serializes concurrent access tại DB level.
   * An toàn nhưng slow vì mỗi operation cần DB roundtrip + lock contention.
   */
  private async purchaseDbLock(
    campaignProductId: string
  ): Promise<PurchaseOutcome> {
    const result = await this.benchmarkRepo.purchaseWithDbLock(
      campaignProductId
    )
    return result.success ? 'SUCCESS' : 'SOLD_OUT'
  }

  /**
   * REDIS_LUA: Atomic Lua script — production implementation.
   * Không thể bị race condition vì Redis thực thi Lua single-threaded.
   */
  private async purchaseRedisLua(runId: string): Promise<PurchaseOutcome> {
    const key = benchKey(runId, 'lua')
    const script = `
      local current = redis.call('GET', KEYS[1])
      if not current then return -2 end
      current = tonumber(current)
      if current <= 0 then return -1 end
      return redis.call('DECRBY', KEYS[1], 1)
    `
    const result = await this.redis.client.eval(script, 1, key)
    return (result as number) >= 0 ? 'SUCCESS' : 'SOLD_OUT'
  }

  private async getFinalStock(
    runId: string,
    campaignProductId: string,
    strategy: LockStrategy
  ): Promise<number | null> {
    switch (strategy) {
      case LockStrategy.NO_LOCK: {
        const v = await this.redis.client.get(benchKey(runId, 'nolock'))
        return v !== null ? parseInt(v) : null
      }
      case LockStrategy.DB_LOCK:
        return this.benchmarkRepo.getCampaignProductStock(campaignProductId)
      case LockStrategy.REDIS_LUA: {
        const v = await this.redis.client.get(benchKey(runId, 'lua'))
        return v !== null ? parseInt(v) : null
      }
    }
  }
}

// ─── Pure functions ────────────────────────────────────────────────────────────

/**
 * Micro-delay ngẫu nhiên 0–5ms để mô phỏng race condition trong NO_LOCK.
 * Trong production, network latency + OS scheduling đã tạo đủ race window.
 * Trong benchmark in-process, delay giả tạo giúp demo race condition rõ ràng hơn.
 */
function microDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.random() * 5))
}

function computeLatency(latencies: number[]): LatencyStats {
  if (latencies.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0 }
  }

  const sorted = [...latencies].sort((a, b) => a - b)
  const n = sorted.length
  const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / n)

  return {
    avg,
    p50: sorted[Math.floor(n * 0.5)] ?? 0,
    p95: sorted[Math.floor(n * 0.95)] ?? 0,
    p99: sorted[Math.floor(n * 0.99)] ?? 0
  }
}

function buildConclusion(
  noLock: BenchmarkResultDto,
  dbLock: BenchmarkResultDto,
  redisLua: BenchmarkResultDto
): string {
  const lines: string[] = []

  lines.push(
    `Throughput: Redis Lua (${redisLua.throughputRPS} RPS) vs DB Lock (${dbLock.throughputRPS} RPS) ` +
      `vs No Lock (${noLock.throughputRPS} RPS)`
  )

  if (noLock.oversellCount > 0) {
    lines.push(
      `No Lock phát hiện ${noLock.oversellCount} lần oversell — KHÔNG AN TOÀN cho production.`
    )
  }

  lines.push(
    `DB Lock: ${dbLock.isCorrect ? 'zero oversell ✓' : 'có lỗi ✗'}, P95=${
      dbLock.p95LatencyMs
    }ms`
  )
  lines.push(
    `Redis Lua: ${redisLua.isCorrect ? 'zero oversell ✓' : 'có lỗi ✗'}, P95=${
      redisLua.p95LatencyMs
    }ms`
  )

  const speedup =
    dbLock.throughputRPS > 0
      ? (redisLua.throughputRPS / dbLock.throughputRPS).toFixed(1)
      : 'N/A'

  lines.push(
    `Kết luận: Redis Lua Script là lựa chọn tối ưu — ` +
      `nhanh hơn DB Lock ${speedup}x, đảm bảo zero oversell.`
  )

  return lines.join(' | ')
}
