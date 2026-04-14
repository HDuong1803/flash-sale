import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { RedisService } from '@infrastructure/redis/redis.service'
import { AnalyticsService } from './analytics.service'
import { AnalyticsRepository } from '../repositories/analytics.repository'

/**
 * Redis key cho distributed lock — ngăn chạy trùng lặp giữa nhiều instance.
 * Khác với pricing lock để tránh xung đột key.
 */
const CRON_LOCK_KEY = 'analytics:cron:lock'
/**
 * TTL của lock = 4 phút.
 * Nhỏ hơn chu kỳ 5 phút để lock tự hết hạn nếu process crash giữa chừng,
 * đảm bảo lần chạy tiếp theo vẫn được phép acquire lock.
 */
const LOCK_TTL_SECONDS = 240

@Injectable()
export class AnalyticsSchedulerService {
  private readonly logger = new Logger(AnalyticsSchedulerService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly analyticsService: AnalyticsService,
    private readonly analyticsRepo: AnalyticsRepository
  ) {}

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
    const acquired = await this.acquireLock()
    if (!acquired) {
      this.logger.debug(
        'Analytics cron: instance khác đang chạy, bỏ qua chu kỳ này'
      )
      return
    }

    try {
      await this.snapshotActiveCampaigns()
    } finally {
      // Luôn release lock dù có lỗi hay không
      await this.releaseLock()
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

    // Chạy song song, lỗi từng product được cô lập
    const results = await Promise.allSettled(
      activeCampaignProducts.map(cp =>
        this.analyticsService.createSnapshot(cp.campaignId, cp.id)
      )
    )

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
  private async acquireLock(): Promise<boolean> {
    try {
      return await this.redis.acquireLock(
        CRON_LOCK_KEY,
        LOCK_TTL_SECONDS * 1000 // acquireLock nhận ms
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Không thể acquire analytics cron lock: ${msg}`)
      return false // fail-safe: bỏ qua chu kỳ thay vì chạy trùng
    }
  }

  /**
   * Release distributed lock sau khi hoàn thành chu kỳ.
   * Nếu lỗi → chỉ log warn, không throw (lock sẽ tự hết hạn sau TTL).
   */
  private async releaseLock(): Promise<void> {
    try {
      await this.redis.releaseLock(CRON_LOCK_KEY)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Không thể release analytics cron lock: ${msg}`)
      // Lock sẽ tự hết hạn sau ${LOCK_TTL_SECONDS}s — không ảnh hưởng tính đúng đắn
    }
  }
}
