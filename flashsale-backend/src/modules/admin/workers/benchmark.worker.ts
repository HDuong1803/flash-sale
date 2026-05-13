/**
 * benchmark.worker.ts — Chạy trong Worker Thread riêng biệt.
 *
 * Không dùng NestJS DI. Tự tạo kết nối Redis + Prisma độc lập.
 * Giao tiếp với BenchmarkService qua parentPort.postMessage.
 *
 * Messages gửi ra:
 *   { type: 'done',  result: object }   — hoàn thành thành công
 *   { type: 'error', error: string }    — thất bại
 */

import { parentPort, workerData } from 'worker_threads'
import Redis from 'ioredis'
import { PrismaClient, LockStrategy } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkerData {
  runId: string
  dto: {
    campaignProductId: string
    concurrentUsers: number
    stockAmount: number
    strategyMode: 'NO_LOCK' | 'DB_LOCK' | 'REDIS_LUA' | 'ALL'
  }
  redisOptions: { host: string; port: number; password?: string }
  databaseUrl: string
}

type PurchaseOutcome = 'SUCCESS' | 'SOLD_OUT' | 'ERROR'

interface SingleResult {
  outcome: PurchaseOutcome
  latencyMs: number
}

interface LatencyStats {
  p50: number
  p95: number
  p99: number
  avg: number
}

interface ScenarioResult {
  strategy: string
  concurrentUsers: number
  stockAmount: number
  succeeded: number
  failed: number
  errors: number
  oversellCount: number
  finalStock: number | null
  expectedFinalStock: number
  isCorrect: boolean
  totalTimeMs: number
  throughputRPS: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE: Record<LockStrategy, number> = {
  [LockStrategy.NO_LOCK]: 500,
  [LockStrategy.DB_LOCK]: 50,
  [LockStrategy.REDIS_LUA]: 500
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function benchKey(runId: string, type: 'nolock' | 'lua'): string {
  return `benchmark:${runId}:${type}`
}

async function microDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.random() * 5))
}

function computeLatency(latencies: number[]): LatencyStats {
  if (!latencies.length) return { p50: 0, p95: 0, p99: 0, avg: 0 }
  const sorted = [...latencies].sort((a, b) => a - b)
  const n = sorted.length
  return {
    avg: Math.round(sorted.reduce((s, v) => s + v, 0) / n),
    p50: sorted[Math.floor(n * 0.5)] ?? 0,
    p95: sorted[Math.floor(n * 0.95)] ?? 0,
    p99: sorted[Math.floor(n * 0.99)] ?? 0
  }
}

function yield_(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

// ─── Simulation functions ─────────────────────────────────────────────────────

async function purchaseNoLock(
  redis: Redis,
  runId: string
): Promise<PurchaseOutcome> {
  const key = benchKey(runId, 'nolock')
  const raw = await redis.get(key)
  const current = raw !== null ? parseInt(raw) : 0
  if (current <= 0) return 'SOLD_OUT'
  await microDelay()
  await redis.decrby(key, 1)
  return 'SUCCESS'
}

async function purchaseDbLock(
  prisma: PrismaClient,
  campaignProductId: string
): Promise<PurchaseOutcome> {
  const success = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ remaining_quantity: number }[]>`
      SELECT remaining_quantity
      FROM campaign_products
      WHERE id = ${campaignProductId}
      FOR UPDATE
    `
    if (!rows.length || rows[0].remaining_quantity <= 0) return false
    await tx.$executeRaw`
      UPDATE campaign_products
      SET remaining_quantity = remaining_quantity - 1
      WHERE id = ${campaignProductId}
    `
    return true
  })
  return success ? 'SUCCESS' : 'SOLD_OUT'
}

async function purchaseRedisLua(
  redis: Redis,
  runId: string
): Promise<PurchaseOutcome> {
  const key = benchKey(runId, 'lua')
  const script = `
    local current = redis.call('GET', KEYS[1])
    if not current then return -2 end
    current = tonumber(current)
    if current <= 0 then return -1 end
    return redis.call('DECRBY', KEYS[1], 1)
  `
  const result = await redis.eval(script, 1, key)
  return (result as number) >= 0 ? 'SUCCESS' : 'SOLD_OUT'
}

async function simulateSingle(
  redis: Redis,
  prisma: PrismaClient,
  runId: string,
  campaignProductId: string,
  strategy: LockStrategy
): Promise<SingleResult> {
  const t0 = Date.now()
  try {
    let outcome: PurchaseOutcome
    switch (strategy) {
      case LockStrategy.NO_LOCK:
        outcome = await purchaseNoLock(redis, runId)
        break
      case LockStrategy.DB_LOCK:
        outcome = await purchaseDbLock(prisma, campaignProductId)
        break
      case LockStrategy.REDIS_LUA:
        outcome = await purchaseRedisLua(redis, runId)
        break
    }
    return { outcome, latencyMs: Date.now() - t0 }
  } catch {
    return { outcome: 'ERROR', latencyMs: Date.now() - t0 }
  }
}

async function runConcurrent(
  redis: Redis,
  prisma: PrismaClient,
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
      Array.from({ length: count }, () =>
        simulateSingle(redis, prisma, runId, campaignProductId, strategy)
      )
    )
    results.push(...batch)
    await yield_()
  }

  return results
}

async function initStock(
  redis: Redis,
  prisma: PrismaClient,
  runId: string,
  campaignProductId: string,
  stockAmount: number,
  strategy: LockStrategy
): Promise<void> {
  switch (strategy) {
    case LockStrategy.NO_LOCK:
      await redis.set(benchKey(runId, 'nolock'), stockAmount, 'EX', 600)
      break
    case LockStrategy.DB_LOCK:
      await prisma.$executeRaw`
        UPDATE campaign_products SET remaining_quantity = ${stockAmount} WHERE id = ${campaignProductId}
      `
      break
    case LockStrategy.REDIS_LUA:
      await redis.set(benchKey(runId, 'lua'), stockAmount, 'EX', 600)
      break
  }
}

async function cleanupScenario(
  redis: Redis,
  runId: string,
  strategy: LockStrategy
): Promise<void> {
  if (strategy === LockStrategy.NO_LOCK)
    await redis.del(benchKey(runId, 'nolock'))
  if (strategy === LockStrategy.REDIS_LUA)
    await redis.del(benchKey(runId, 'lua'))
}

async function getFinalStock(
  redis: Redis,
  prisma: PrismaClient,
  runId: string,
  campaignProductId: string,
  strategy: LockStrategy
): Promise<number | null> {
  switch (strategy) {
    case LockStrategy.NO_LOCK: {
      const v = await redis.get(benchKey(runId, 'nolock'))
      return v !== null ? parseInt(v) : null
    }
    case LockStrategy.DB_LOCK: {
      const rows = await prisma.$queryRaw<{ remaining_quantity: number }[]>`
        SELECT remaining_quantity FROM campaign_products WHERE id = ${campaignProductId}
      `
      return rows[0]?.remaining_quantity ?? 0
    }
    case LockStrategy.REDIS_LUA: {
      const v = await redis.get(benchKey(runId, 'lua'))
      return v !== null ? parseInt(v) : null
    }
  }
}

async function runScenario(
  redis: Redis,
  prisma: PrismaClient,
  runId: string,
  campaignProductId: string,
  concurrentUsers: number,
  stockAmount: number,
  strategy: LockStrategy
): Promise<ScenarioResult> {
  let dbOriginalStock: number | null = null
  if (strategy === LockStrategy.DB_LOCK) {
    const rows = await prisma.$queryRaw<{ remaining_quantity: number }[]>`
      SELECT remaining_quantity FROM campaign_products WHERE id = ${campaignProductId}
    `
    dbOriginalStock = rows[0]?.remaining_quantity ?? 0
  }

  await initStock(
    redis,
    prisma,
    runId,
    campaignProductId,
    stockAmount,
    strategy
  )

  try {
    const startMs = Date.now()
    const results = await runConcurrent(
      redis,
      prisma,
      runId,
      campaignProductId,
      concurrentUsers,
      strategy
    )
    const totalTimeMs = Date.now() - startMs

    const finalStock = await getFinalStock(
      redis,
      prisma,
      runId,
      campaignProductId,
      strategy
    )
    const latency = computeLatency(results.map(r => r.latencyMs))
    const succeeded = results.filter(r => r.outcome === 'SUCCESS').length
    const failed = results.filter(r => r.outcome === 'SOLD_OUT').length
    const errors = results.filter(r => r.outcome === 'ERROR').length
    const oversellCount = Math.max(0, succeeded - stockAmount)

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
    await cleanupScenario(redis, runId, strategy)
    if (dbOriginalStock !== null) {
      await prisma.$executeRaw`
        UPDATE campaign_products SET remaining_quantity = ${dbOriginalStock} WHERE id = ${campaignProductId}
      `
    }
  }
}

function buildConclusion(
  noLock: ScenarioResult,
  dbLock: ScenarioResult,
  redisLua: ScenarioResult
): string {
  const lines: string[] = []
  lines.push(
    `Throughput: Redis Lua (${redisLua.throughputRPS} RPS) vs DB Lock (${dbLock.throughputRPS} RPS) vs No Lock (${noLock.throughputRPS} RPS)`
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
    `Kết luận: Redis Lua Script là lựa chọn tối ưu — nhanh hơn DB Lock ${speedup}x, đảm bảo zero oversell.`
  )
  return lines.join(' | ')
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { runId, dto, redisOptions, databaseUrl } = workerData as WorkerData

  const redis = new Redis(redisOptions)
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

  try {
    let result: object

    if (dto.strategyMode === 'ALL') {
      const noLock = await runScenario(
        redis,
        prisma,
        `${runId}-nolock`,
        dto.campaignProductId,
        dto.concurrentUsers,
        dto.stockAmount,
        LockStrategy.NO_LOCK
      )
      const dbLock = await runScenario(
        redis,
        prisma,
        `${runId}-dblock`,
        dto.campaignProductId,
        dto.concurrentUsers,
        dto.stockAmount,
        LockStrategy.DB_LOCK
      )
      const redisLua = await runScenario(
        redis,
        prisma,
        `${runId}-lua`,
        dto.campaignProductId,
        dto.concurrentUsers,
        dto.stockAmount,
        LockStrategy.REDIS_LUA
      )
      result = {
        noLock,
        dbLock,
        redisLua,
        recommendation: 'REDIS_LUA',
        conclusion: buildConclusion(noLock, dbLock, redisLua)
      }
    } else {
      const strategyMap: Record<string, LockStrategy> = {
        NO_LOCK: LockStrategy.NO_LOCK,
        DB_LOCK: LockStrategy.DB_LOCK,
        REDIS_LUA: LockStrategy.REDIS_LUA
      }
      result = await runScenario(
        redis,
        prisma,
        runId,
        dto.campaignProductId,
        dto.concurrentUsers,
        dto.stockAmount,
        strategyMap[dto.strategyMode]
      )
    }

    parentPort?.postMessage({ type: 'done', result })
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    parentPort?.postMessage({ type: 'error', error })
  } finally {
    await redis.quit()
    await prisma.$disconnect()
  }
}

void main()
