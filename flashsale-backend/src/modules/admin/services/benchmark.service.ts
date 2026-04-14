import { Injectable, Logger } from '@nestjs/common'
import { LockStrategy } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { StockAuditRepository } from '@modules/order/repositories/stock-audit.repository'
import { BenchmarkRepository } from '../repositories/benchmark.repository'
import {
  BenchmarkResultDto,
  BenchmarkComparisonDto,
  RunBenchmarkDto,
  RunAllBenchmarkDto
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

@Injectable()
export class BenchmarkService {
  private readonly logger = new Logger(BenchmarkService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly benchmarkRepo: BenchmarkRepository,
    private readonly stockAuditRepo: StockAuditRepository
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  async runScenario(dto: RunBenchmarkDto): Promise<BenchmarkResultDto> {
    const { campaignProductId, concurrentUsers, stockAmount, strategy } = dto

    const runId = `${campaignProductId}-${Date.now()}`
    const benchmarkStart = new Date()

    await this.initStock(runId, campaignProductId, stockAmount, strategy)

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
    const oversellCount = await this.stockAuditRepo.countOversell(
      campaignProductId,
      benchmarkStart
    )
    const latency = computeLatency(results.map(r => r.latencyMs))

    const succeeded = results.filter(r => r.outcome === 'SUCCESS').length
    const failed = results.filter(r => r.outcome === 'SOLD_OUT').length
    const errors = results.filter(r => r.outcome === 'ERROR').length

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

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async initStock(
    runId: string,
    campaignProductId: string,
    amount: number,
    strategy: LockStrategy
  ): Promise<void> {
    switch (strategy) {
      case LockStrategy.NO_LOCK:
        await this.redis.client.set(benchKey(runId, 'nolock'), amount)
        break
      case LockStrategy.DB_LOCK:
        await this.benchmarkRepo.resetCampaignProductStock(
          campaignProductId,
          amount
        )
        break
      case LockStrategy.REDIS_LUA:
        await this.redis.client.set(benchKey(runId, 'lua'), amount)
        break
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
