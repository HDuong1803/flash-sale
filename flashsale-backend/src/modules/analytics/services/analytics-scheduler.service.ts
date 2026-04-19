import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { RedisService } from '@infrastructure/redis/redis.service'
import { AnalyticsService } from './analytics.service'
import { AnalyticsRepository } from '../repositories/analytics.repository'

/**
 * Redis key cho distributed lock — ngăn chạy trùng lặp giữa nhiều instance.
 * Key riêng biệt để tránh xung đột với các lock khác.
 */
const SNAPSHOT_CRON_LOCK_KEY = 'analytics:cron:lock'
/**
 * TTL của lock = 4 phút.
 * Nhỏ hơn chu kỳ 5 phút để lock tự hết hạn nếu process crash giữa chừng,
 * đảm bảo lần chạy tiếp theo vẫn được phép acquire lock.
 */
const SNAPSHOT_LOCK_TTL_SECONDS = 240
const SNAPSHOT_LOCK_HEARTBEAT_INTERVAL_MS = 60_000

const CLEANUP_CRON_LOCK_KEY = 'analytics:cron:cleanup:lock'
const CLEANUP_LOCK_TTL_SECONDS = 900
const CLEANUP_LOCK_HEARTBEAT_INTERVAL_MS = 60_000

const DEFAULT_SNAPSHOT_RETENTION_DAYS = 30
const DEFAULT_CLEANUP_BATCH_SIZE = 5000
const DEFAULT_CLEANUP_MAX_BATCHES = 24
const MAX_CLEANUP_BATCH_SIZE = 50_000
const MAX_CLEANUP_BATCHES = 200

@Injectable()
export class AnalyticsSchedulerService {
  private readonly logger = new Logger(AnalyticsSchedulerService.name)
  private readonly cleanupEnabled: boolean
  private readonly snapshotRetentionDays: number
  private readonly cleanupBatchSize: number
  private readonly cleanupMaxBatches: number

  constructor(
    private readonly redis: RedisService,
    private readonly analyticsService: AnalyticsService,
    private readonly analyticsRepo: AnalyticsRepository,
    private readonly configService: ConfigService
  ) {
    this.cleanupEnabled = this.parseBooleanConfig(
      'ANALYTICS_SNAPSHOT_CLEANUP_ENABLED',
      true
    )
    this.snapshotRetentionDays = this.parsePositiveIntConfig(
      'ANALYTICS_SNAPSHOT_RETENTION_DAYS',
      DEFAULT_SNAPSHOT_RETENTION_DAYS,
      1,
      3650
    )
    this.cleanupBatchSize = this.parsePositiveIntConfig(
      'ANALYTICS_SNAPSHOT_CLEANUP_BATCH_SIZE',
      DEFAULT_CLEANUP_BATCH_SIZE,
      1,
      MAX_CLEANUP_BATCH_SIZE
    )
    this.cleanupMaxBatches = this.parsePositiveIntConfig(
      'ANALYTICS_SNAPSHOT_CLEANUP_MAX_BATCHES',
      DEFAULT_CLEANUP_MAX_BATCHES,
      1,
      MAX_CLEANUP_BATCHES
    )
  }

  /**
   * Chụp snapshot mỗi 5 phút cho tất cả campaign product đang ACTIVE.
   *
   * Cơ chế distributed lock (Redis SET NX PX):
   * - Chỉ một instance được chạy tại một thời điểm (tránh duplicate khi deploy nhiều pod)
   * - Nếu instance khác đang giữ lock → bỏ qua chu kỳ này ngay lập tức
   *
   * Cơ chế fault isolation:
   * - Mỗi product được xử lý độc lập qua Promise.allSettled
   * - Một product lỗi không ảnh hưởng đến các product còn lại
   *
   * Luồng: acquire lock → lấy danh sách products → chụp song song → release lock
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runSnapshotCycle(): Promise<void> {
    const lockToken = await this.acquireLock(
      SNAPSHOT_CRON_LOCK_KEY,
      SNAPSHOT_LOCK_TTL_SECONDS
    )
    if (!lockToken) {
      this.logger.debug(
        'Analytics cron: instance khác đang chạy, bỏ qua chu kỳ này'
      )
      return
    }

    const stopHeartbeat = this.startLockHeartbeat(
      SNAPSHOT_CRON_LOCK_KEY,
      lockToken,
      SNAPSHOT_LOCK_TTL_SECONDS,
      SNAPSHOT_LOCK_HEARTBEAT_INTERVAL_MS
    )

    try {
      await this.snapshotActiveCampaigns()
    } finally {
      stopHeartbeat()
      // Luôn release lock dù có lỗi hay không
      await this.releaseLock(SNAPSHOT_CRON_LOCK_KEY, lockToken)
    }
  }

  /**
   * Dọn snapshot cũ theo chính sách retention.
   *
   * Thiết kế tối ưu cho bảng lớn:
   * - Chạy theo batch để tránh giữ lock DB quá lâu
   * - Có giới hạn số batch mỗi lần chạy để bảo vệ DB trong peak
   * - Có distributed lock riêng để tránh nhiều instance cùng dọn
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupSnapshotHistory(): Promise<void> {
    if (!this.cleanupEnabled) {
      this.logger.debug('Analytics cleanup: đã tắt qua config')
      return
    }

    const lockToken = await this.acquireLock(
      CLEANUP_CRON_LOCK_KEY,
      CLEANUP_LOCK_TTL_SECONDS
    )
    if (!lockToken) {
      this.logger.debug('Analytics cleanup: instance khác đang chạy, bỏ qua')
      return
    }

    const stopHeartbeat = this.startLockHeartbeat(
      CLEANUP_CRON_LOCK_KEY,
      lockToken,
      CLEANUP_LOCK_TTL_SECONDS,
      CLEANUP_LOCK_HEARTBEAT_INTERVAL_MS
    )

    try {
      await this.cleanupExpiredSnapshots()
    } finally {
      stopHeartbeat()
      await this.releaseLock(CLEANUP_CRON_LOCK_KEY, lockToken)
    }
  }

  private startLockHeartbeat(
    lockKey: string,
    token: string,
    ttlSeconds: number,
    intervalMs: number
  ): () => void {
    const interval = setInterval(() => {
      void this.redis
        .extendLockToken(lockKey, token, ttlSeconds * 1000)
        .then(extended => {
          if (!extended) {
            this.logger.warn(
              `Analytics lock không thể gia hạn (${lockKey}), có thể đã hết hạn hoặc bị thay thế`
            )
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          this.logger.warn(
            `Lỗi khi gia hạn analytics lock (${lockKey}): ${msg}`
          )
        })
    }, intervalMs)

    return () => clearInterval(interval)
  }

  private async cleanupExpiredSnapshots(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.snapshotRetentionDays * 24 * 60 * 60 * 1000
    )

    let totalDeleted = 0
    let reachedBatchLimit = false

    for (
      let batchIndex = 0;
      batchIndex < this.cleanupMaxBatches;
      batchIndex++
    ) {
      const deleted = await this.analyticsRepo.deleteSnapshotsOlderThan(
        cutoff,
        this.cleanupBatchSize
      )

      totalDeleted += deleted

      if (deleted < this.cleanupBatchSize) {
        reachedBatchLimit = false
        break
      }

      reachedBatchLimit = batchIndex === this.cleanupMaxBatches - 1
    }

    if (totalDeleted === 0) {
      this.logger.debug(
        `Analytics cleanup: không có snapshot cũ hơn ${this.snapshotRetentionDays} ngày`
      )
      return
    }

    this.logger.log(
      `Analytics cleanup: đã xóa ${totalDeleted} snapshot cũ hơn ${this.snapshotRetentionDays} ngày`
    )

    if (
      reachedBatchLimit &&
      (await this.analyticsRepo.hasSnapshotsOlderThan(cutoff))
    ) {
      this.logger.warn(
        `Analytics cleanup: đạt giới hạn ${this.cleanupMaxBatches} batch/lần chạy, dữ liệu cũ còn lại sẽ được xử lý ở chu kỳ tiếp theo`
      )
    }
  }

  /**
   * Lấy danh sách tất cả campaign product đang ACTIVE rồi chụp snapshot song song.
   * Ghi log chi tiết: bao nhiêu thành công, bao nhiêu thất bại.
   */
  private async snapshotActiveCampaigns(): Promise<void> {
    const activeCampaignProducts =
      await this.analyticsRepo.findActiveCampaignProducts()

    if (activeCampaignProducts.length === 0) {
      this.logger.debug(
        'Analytics cron: không có campaign product nào đang chạy'
      )
      return
    }

    this.logger.debug(
      `Analytics cron: đang chụp ${activeCampaignProducts.length} campaign product`
    )

    // Chạy song song từng batch nhỏ, lỗi từng product được cô lập
    const CONCURRENCY_LIMIT = 10
    const results: PromiseSettledResult<any>[] = []

    for (let i = 0; i < activeCampaignProducts.length; i += CONCURRENCY_LIMIT) {
      const batch = activeCampaignProducts.slice(i, i + CONCURRENCY_LIMIT)
      const batchResults = await Promise.allSettled(
        batch.map(cp =>
          this.analyticsService.createSnapshot(cp.campaignId, cp.id)
        )
      )
      results.push(...batchResults)
    }

    const failed = results.filter(r => r.status === 'rejected')
    if (failed.length > 0) {
      this.logger.warn(`Analytics cron: ${failed.length} snapshot thất bại`)
      for (const r of failed) {
        if (r.status === 'rejected') {
          const msg =
            r.reason instanceof Error ? r.reason.message : String(r.reason)
          this.logger.warn(`Snapshot lỗi: ${msg}`)
        }
      }
    }

    this.logger.debug(
      `Analytics cron: ${results.length - failed.length}/${
        results.length
      } snapshot đã tạo thành công`
    )
  }

  /**
   * Cố gắng acquire distributed lock qua RedisService.acquireLock (SET NX PX).
   * Trả về true nếu giành được lock, false nếu instance khác đang giữ.
   * Nếu Redis lỗi → fail-safe: bỏ qua chu kỳ (không throw, không chạy trùng).
   */
  private async acquireLock(
    lockKey: string,
    ttlSeconds: number
  ): Promise<string | null> {
    try {
      return await this.redis.acquireLockToken(
        lockKey,
        ttlSeconds * 1000 // acquireLock nhận ms
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Không thể acquire analytics lock (${lockKey}): ${msg}`)
      return null // fail-safe: bỏ qua chu kỳ thay vì chạy trùng
    }
  }

  /**
   * Release distributed lock sau khi hoàn thành chu kỳ.
   * Nếu lỗi → chỉ log warn, không throw (lock sẽ tự hết hạn sau TTL).
   */
  private async releaseLock(lockKey: string, token: string): Promise<void> {
    try {
      await this.redis.releaseLockToken(lockKey, token)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Không thể release analytics lock (${lockKey}): ${msg}`)
      // Lock sẽ tự hết hạn sau TTL — không ảnh hưởng tính đúng đắn
    }
  }

  private parsePositiveIntConfig(
    key: string,
    fallback: number,
    min: number,
    max: number
  ): number {
    const rawValue = this.configService.get<string>(key)
    if (!rawValue) {
      return fallback
    }

    const normalized = rawValue.trim()
    if (!/^\d+$/.test(normalized)) {
      this.logger.warn(
        `Config ${key}=${rawValue} không hợp lệ, dùng mặc định ${fallback}`
      )
      return fallback
    }

    const parsed = Number.parseInt(normalized, 10)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      this.logger.warn(
        `Config ${key}=${rawValue} không hợp lệ, dùng mặc định ${fallback}`
      )
      return fallback
    }

    return parsed
  }

  private parseBooleanConfig(key: string, fallback: boolean): boolean {
    const rawValue = this.configService.get<string>(key)
    if (!rawValue) {
      return fallback
    }

    const normalized = rawValue.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false
    }

    this.logger.warn(
      `Config ${key}=${rawValue} không hợp lệ, dùng mặc định ${fallback}`
    )
    return fallback
  }
}
