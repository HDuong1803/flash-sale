import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { RedisService } from '@infrastructure/redis/redis.service'
import { DemoJobState } from '../dto/demo.dto'
import { DemoSeedService } from './demo-seed.service'
import { DemoLoadTestService } from './demo-load-test.service'
import { DemoRepository } from '../repositories/demo.repository'

// Thời gian TTL cho job state trong Redis (2 giờ)
const JOB_TTL_SECONDS = 7200

/**
 * DemoService — quản lý background jobs cho demo module
 *
 * Flow:
 *   POST /demo/seed → startSeedJob() → fire-and-forget → lưu state Redis
 *   GET  /demo/jobs/:id → getJobStatus() → đọc state từ Redis
 *
 * Không dùng Bull/BullMQ — Redis trực tiếp để self-contained, dễ xóa
 */
@Injectable()
export class DemoService implements OnModuleDestroy {
  private readonly logger = new Logger(DemoService.name)

  // Track các promise đang chạy để cleanup khi module destroy
  private readonly runningJobs = new Map<string, Promise<void>>()

  constructor(
    private readonly redis: RedisService,
    private readonly seedService: DemoSeedService,
    private readonly loadTestService: DemoLoadTestService,
    private readonly repo: DemoRepository
  ) {}

  onModuleDestroy() {
    this.logger.warn(
      `DemoService destroying — ${this.runningJobs.size} jobs still running`
    )
  }

  // ─── Bắt đầu seed job ─────────────────────────────────────────────────────────

  /**
   * startSeedJob — khởi động background job tạo dữ liệu lịch sử
   * Trả về jobId ngay lập tức, job chạy async ở background
   */
  async startSeedJob(opts: {
    numCustomers: number
    minOrders: number
    maxOrders: number
  }): Promise<string> {
    const jobId = `demo-seed-${randomUUID().slice(0, 8)}`

    const state: DemoJobState = {
      jobId,
      type: 'seed',
      status: 'pending',
      progress: 0,
      startedAt: new Date().toISOString()
    }
    await this.saveJobState(state)

    // Fire-and-forget: không await, chạy song song với response trả về client
    const jobPromise = this.runSeedJob(jobId, opts)
      .catch(err => {
        this.logger.error(
          `[${jobId}] Seed job crashed: ${(err as Error).message}`
        )
      })
      .finally(() => {
        this.runningJobs.delete(jobId)
      })
    this.runningJobs.set(jobId, jobPromise)

    this.logger.log(
      `[${jobId}] Seed job started (numCustomers=${opts.numCustomers})`
    )
    return jobId
  }

  // ─── Bắt đầu load test job ────────────────────────────────────────────────────

  /**
   * startLoadTestJob — khởi động background job load test
   * Chạy concurrent purchase requests tới campaign đang ACTIVE
   */
  async startLoadTestJob(opts: {
    campaignId?: string
    autoDetect?: boolean
    concurrency: number
    totalRequests: number
    delayMs?: number
    resetCounters?: boolean
  }): Promise<string> {
    const jobId = `demo-lt-${randomUUID().slice(0, 8)}`

    const state: DemoJobState = {
      jobId,
      type: 'load-test',
      status: 'pending',
      progress: 0,
      startedAt: new Date().toISOString()
    }
    await this.saveJobState(state)

    const jobPromise = this.runLoadTestJob(jobId, opts)
      .catch(err => {
        this.logger.error(
          `[${jobId}] Load test job crashed: ${(err as Error).message}`
        )
      })
      .finally(() => {
        this.runningJobs.delete(jobId)
      })
    this.runningJobs.set(jobId, jobPromise)

    this.logger.log(
      `[${jobId}] Load test job started (campaignId=${
        opts.campaignId ?? 'auto'
      }, ` +
        `total=${opts.totalRequests}, delay=${opts.delayMs ?? 0}ms, reset=${
          opts.resetCounters ?? true
        })`
    )
    return jobId
  }

  // ─── Đọc trạng thái job ───────────────────────────────────────────────────────

  async getJobStatus(jobId: string): Promise<DemoJobState | null> {
    const key = this.jobKey(jobId)
    const raw = await this.redis.client.get(key)
    if (!raw) return null
    return JSON.parse(raw) as DemoJobState
  }

  // ─── Cleanup toàn bộ historical data ─────────────────────────────────────────

  async cleanupHistoricalData(): Promise<Record<string, unknown>> {
    this.logger.log('Bắt đầu cleanup historical data...')
    const result = await this.repo.cleanupHistoricalData()
    this.logger.log(`Cleanup xong: ${JSON.stringify(result)}`)
    return result
  }

  // ─── Private: chạy seed job ───────────────────────────────────────────────────

  private async runSeedJob(
    jobId: string,
    opts: { numCustomers: number; minOrders: number; maxOrders: number }
  ): Promise<void> {
    await this.updateJobStatus(jobId, 'running', 0, 'Đang khởi động...')

    try {
      const result = await this.seedService.runSeed(
        opts,
        async (progress, step) => {
          await this.updateJobStatus(jobId, 'running', progress, step)
        }
      )

      await this.updateJobStatusDone(jobId, result)
      this.logger.log(
        `[${jobId}] Seed job completed: ${JSON.stringify(result)}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.updateJobStatusFailed(jobId, msg)
      this.logger.error(`[${jobId}] Seed job failed: ${msg}`)
    }
  }

  // ─── Private: chạy load test job ─────────────────────────────────────────────

  private async runLoadTestJob(
    jobId: string,
    opts: {
      campaignId?: string
      autoDetect?: boolean
      concurrency: number
      totalRequests: number
      delayMs?: number
      resetCounters?: boolean
    }
  ): Promise<void> {
    await this.updateJobStatus(
      jobId,
      'running',
      0,
      'Đang khởi động load test...'
    )

    try {
      const result = await this.loadTestService.runLoadTest(
        opts,
        async (progress, step) => {
          await this.updateJobStatus(jobId, 'running', progress, step)
        }
      )

      await this.updateJobStatusDone(jobId, result)
      this.logger.log(
        `[${jobId}] Load test job completed: ${JSON.stringify(result)}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.updateJobStatusFailed(jobId, msg)
      this.logger.error(`[${jobId}] Load test job failed: ${msg}`)
    }
  }

  // ─── Private: helpers lưu state Redis ────────────────────────────────────────

  private jobKey(jobId: string): string {
    return `demo:job:${jobId}`
  }

  private async saveJobState(state: DemoJobState): Promise<void> {
    await this.redis.client.set(
      this.jobKey(state.jobId),
      JSON.stringify(state),
      'EX',
      JOB_TTL_SECONDS
    )
  }

  private async updateJobStatus(
    jobId: string,
    status: DemoJobState['status'],
    progress: number,
    currentStep: string
  ): Promise<void> {
    const key = this.jobKey(jobId)
    const raw = await this.redis.client.get(key)
    if (!raw) return

    const state = JSON.parse(raw) as DemoJobState
    const updated: DemoJobState = { ...state, status, progress, currentStep }
    await this.redis.client.set(
      key,
      JSON.stringify(updated),
      'EX',
      JOB_TTL_SECONDS
    )
  }

  private async updateJobStatusDone(
    jobId: string,
    result: Record<string, unknown>
  ): Promise<void> {
    const key = this.jobKey(jobId)
    const raw = await this.redis.client.get(key)
    if (!raw) return

    const state = JSON.parse(raw) as DemoJobState
    const updated: DemoJobState = {
      ...state,
      status: 'completed',
      progress: 100,
      result,
      finishedAt: new Date().toISOString()
    }
    await this.redis.client.set(
      key,
      JSON.stringify(updated),
      'EX',
      JOB_TTL_SECONDS
    )
  }

  private async updateJobStatusFailed(
    jobId: string,
    error: string
  ): Promise<void> {
    const key = this.jobKey(jobId)
    const raw = await this.redis.client.get(key)
    if (!raw) return

    const state = JSON.parse(raw) as DemoJobState
    const updated: DemoJobState = {
      ...state,
      status: 'failed',
      error,
      finishedAt: new Date().toISOString()
    }
    await this.redis.client.set(
      key,
      JSON.stringify(updated),
      'EX',
      JOB_TTL_SECONDS
    )
  }
}
