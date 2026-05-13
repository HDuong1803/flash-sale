import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy
} from '@nestjs/common'
import { createId } from '@paralleldrive/cuid2'
import { LockStrategy } from '@prisma/client'
import * as path from 'path'
import { Worker } from 'worker_threads'
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

// ─── Constants ────────────────────────────────────────────────────────────────

const benchKey = (runId: string, type: 'nolock' | 'lua') =>
  `benchmark:${runId}:${type}`

const runStatusKey = (runId: string) => `benchmark:run:${runId}:status`
const runResultKey = (runId: string) => `benchmark:run:${runId}:result`
const RUN_TTL = 86400 // 24 hours

// Giới hạn theo strategy (chỉ áp dụng NO_LOCK và DB_LOCK)
const MAX_CONCURRENT: Partial<Record<string, number>> = {
  NO_LOCK: 10000,
  DB_LOCK: 2000,
  ALL: 2000 // bị giới hạn bởi DB_LOCK chạy bên trong
}

// Batch sizes cho các strategy trong sync endpoints
const BATCH_SIZE: Record<LockStrategy, number> = {
  [LockStrategy.NO_LOCK]: 500,
  [LockStrategy.DB_LOCK]: 50,
  [LockStrategy.REDIS_LUA]: 500
}

@Injectable()
export class BenchmarkService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BenchmarkService.name)
  private readonly activeWorkers = new Map<string, Worker>()

  constructor(
    private readonly redis: RedisService,
    private readonly benchmarkRepo: BenchmarkRepository
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const count = await this.benchmarkRepo.markOrphanedRunsFailed()
    if (count > 0) {
      this.logger.warn(
        `Đánh dấu ${count} benchmark job bị orphan (RUNNING) thành FAILED khi khởi động`
      )
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const [runId, worker] of this.activeWorkers) {
      await worker.terminate()
      await this.benchmarkRepo.updateRunStatus(runId, 'FAILED', {
        errorMessage: 'Server đang tắt',
        completedAt: new Date()
      })
    }
    this.activeWorkers.clear()
  }

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
    // Giới hạn per-strategy để tránh DB pool exhaustion
    const limit = MAX_CONCURRENT[dto.strategyMode]
    if (limit !== undefined && dto.concurrentUsers > limit) {
      throw new BadRequestException(
        `Chiến lược ${
          dto.strategyMode
        } tối đa ${limit.toLocaleString()} người dùng đồng thời. ` +
          `REDIS_LUA không có giới hạn.`
      )
    }

    const { id: runId } = await this.benchmarkRepo.createRun({
      campaignProductId: dto.campaignProductId,
      concurrentUsers: dto.concurrentUsers,
      stockAmount: dto.stockAmount,
      strategyMode: dto.strategyMode
    })

    await this.redis.client.set(runStatusKey(runId), 'PENDING', 'EX', RUN_TTL)

    // Chạy trong Worker Thread riêng — không block main event loop
    void this.spawnBenchmarkWorker(runId, dto)

    return { runId }
  }

  async getRunStatus(runId: string): Promise<BenchmarkRunDto> {
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

      const run = await this.benchmarkRepo.findRunById(runId)
      if (!run) {
        throw new NotFoundException(`Benchmark run ${runId} không tồn tại`)
      }

      return this.mapRunToDto(run, result ?? this.parseJsonResult(run.result))
    }

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

  async killRun(runId: string): Promise<void> {
    const worker = this.activeWorkers.get(runId)
    if (worker) {
      await worker.terminate()
      this.activeWorkers.delete(runId)
      this.logger.warn(`Worker cho run ${runId} đã bị terminate`)
    }

    const run = await this.benchmarkRepo.findRunById(runId)
    if (!run) {
      throw new NotFoundException(`Benchmark run ${runId} không tồn tại`)
    }

    if (run.status === 'RUNNING' || run.status === 'PENDING') {
      await this.benchmarkRepo.updateRunStatus(runId, 'FAILED', {
        errorMessage: 'Tác vụ bị dừng thủ công',
        completedAt: new Date()
      })
      await this.redis.client.set(runStatusKey(runId), 'FAILED', 'EX', RUN_TTL)
    }
  }

  // ─── Private: Worker Thread ────────────────────────────────────────────────

  private async spawnBenchmarkWorker(
    runId: string,
    dto: StartBenchmarkDto
  ): Promise<void> {
    try {
      await this.benchmarkRepo.updateRunStatus(runId, 'RUNNING')
      await this.redis.client.set(runStatusKey(runId), 'RUNNING', 'EX', RUN_TTL)

      // Detect ts-node vs compiled JS để load đúng worker file
      const isTsNode = __filename.endsWith('.ts')
      const workerFile = isTsNode
        ? path.resolve(__dirname, '../workers/benchmark.worker.ts')
        : path.resolve(__dirname, '../workers/benchmark.worker.js')

      const worker = new Worker(workerFile, {
        execArgv: isTsNode
          ? ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register']
          : [],
        workerData: {
          runId,
          dto,
          redisOptions: {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: parseInt(process.env.REDIS_PORT ?? '6379'),
            password: process.env.REDIS_PASSWORD
          },
          databaseUrl: process.env.DATABASE_URL ?? ''
        }
      })

      this.activeWorkers.set(runId, worker)

      worker.on(
        'message',
        async (msg: { type: string; result?: object; error?: string }) => {
          if (msg.type === 'done') {
            const completedAt = new Date()
            await this.benchmarkRepo.updateRunStatus(runId, 'COMPLETED', {
              result: msg.result,
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
              JSON.stringify(msg.result),
              'EX',
              RUN_TTL
            )
            this.logger.log(`Benchmark run ${runId} hoàn thành thành công`)
          } else if (msg.type === 'error') {
            await this.benchmarkRepo.updateRunStatus(runId, 'FAILED', {
              errorMessage: msg.error,
              completedAt: new Date()
            })
            await this.redis.client.set(
              runStatusKey(runId),
              'FAILED',
              'EX',
              RUN_TTL
            )
            this.logger.error(
              `Benchmark run ${runId} thất bại: ${msg.error ?? 'unknown'}`
            )
          }
          this.activeWorkers.delete(runId)
        }
      )

      worker.on('error', async (err: Error) => {
        this.logger.error(`Worker error cho run ${runId}: ${err.message}`)
        await this.benchmarkRepo.updateRunStatus(runId, 'FAILED', {
          errorMessage: err.message,
          completedAt: new Date()
        })
        await this.redis.client.set(
          runStatusKey(runId),
          'FAILED',
          'EX',
          RUN_TTL
        )
        this.activeWorkers.delete(runId)
      })

      worker.on('exit', (code: number) => {
        this.activeWorkers.delete(runId)
        if (code !== 0 && code !== null) {
          this.logger.warn(`Worker exited với code ${code} cho run ${runId}`)
        }
      })
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred'
      this.logger.error(
        `Không thể spawn worker cho run ${runId}: ${errorMessage}`
      )
      await this.benchmarkRepo.updateRunStatus(runId, 'FAILED', {
        errorMessage,
        completedAt: new Date()
      })
      await this.redis.client.set(runStatusKey(runId), 'FAILED', 'EX', RUN_TTL)
      this.activeWorkers.delete(runId)
    }
  }

  // ─── Private: Simulation cho sync endpoints ────────────────────────────────

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
    const batchSize = BATCH_SIZE[strategy]
    const results: SingleResult[] = []

    for (let i = 0; i < n; i += batchSize) {
      const count = Math.min(batchSize, n - i)
      const batch = await Promise.all(
        Array.from({ length: count }, (_, j) =>
          this.simulateSingle(runId, campaignProductId, i + j, strategy)
        )
      )
      results.push(...batch)
    }

    return results
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

  private async purchaseNoLock(runId: string): Promise<PurchaseOutcome> {
    const key = benchKey(runId, 'nolock')
    const raw = await this.redis.client.get(key)
    const current = raw !== null ? parseInt(raw) : 0

    if (current <= 0) {
      return 'SOLD_OUT'
    }

    await microDelay()

    await this.redis.client.decrby(key, 1)
    return 'SUCCESS'
  }

  private async purchaseDbLock(
    campaignProductId: string
  ): Promise<PurchaseOutcome> {
    const result = await this.benchmarkRepo.purchaseWithDbLock(
      campaignProductId
    )
    return result.success ? 'SUCCESS' : 'SOLD_OUT'
  }

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
}

// ─── Pure functions ────────────────────────────────────────────────────────────

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
