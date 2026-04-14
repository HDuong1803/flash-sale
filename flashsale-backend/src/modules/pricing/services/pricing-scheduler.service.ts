import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { RedisService } from '@infrastructure/redis/redis.service'
import { PricingRepository } from '../repositories/pricing.repository'
import { PricingEngineService } from './pricing-engine.service'

/**
 * Redis key cho distributed lock pricing cron.
 * Khác với analytics lock key để tránh xung đột.
 */
const CRON_LOCK_KEY = 'pricing:cron:lock'
/**
 * TTL lock = 4 phút (< chu kỳ 5 phút).
 * Đảm bảo lock tự hết hạn nếu process crash giữa chừng.
 */
const CRON_LOCK_TTL_S = 240

@Injectable()
export class PricingSchedulerService {
  private readonly logger = new Logger(PricingSchedulerService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly pricingRepo: PricingRepository,
    private readonly pricingEngine: PricingEngineService
  ) {}

  /**
   * Vòng lặp định giá chạy mỗi 5 phút.
   *
   * Cơ chế distributed lock (Redis SET NX EX):
   * - Ngăn nhiều instance chạy cùng lúc khi deploy nhiều pod
   * - Instance không giành được lock sẽ bỏ qua chu kỳ ngay lập tức
   *
   * Cơ chế fault isolation:
   * - Mỗi product được đánh giá độc lập qua Promise.allSettled
   * - Một product lỗi không chặn các product còn lại
   *
   * Xử lý các trường hợp biên:
   * - Không có campaign nào ACTIVE: kết thúc sớm (no-op)
   * - Một product throw: ghi log, tiếp tục các product khác
   * - DB chậm khiến vòng chạy > 5 phút: chu kỳ tiếp theo bị bỏ qua (lock đang giữ)
   * - Process crash khi đang giữ lock: lock tự hết hạn sau CRON_LOCK_TTL_S
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runPricingCycle(): Promise<void> {
    // Acquire distributed lock: chỉ một instance được chạy tại một thời điểm
    const lockToken = await this.redis.acquireLockToken(
      CRON_LOCK_KEY,
      CRON_LOCK_TTL_S * 1000
    )

    if (!lockToken) {
      this.logger.debug(
        'Pricing cron: instance khác đang chạy, bỏ qua chu kỳ này'
      )
      return
    }

    try {
      // Lấy danh sách tất cả campaign product có pricing rule đang ACTIVE
      const targets = await this.pricingRepo.findActivePricingTargets()

      if (targets.length === 0) {
        this.logger.debug('Pricing cron: không có sản phẩm nào cần định giá')
        return
      }

      this.logger.log(`Pricing cron: đang đánh giá ${targets.length} sản phẩm`)

      // Đánh giá song song, lỗi từng sản phẩm được cô lập
      const results = await Promise.allSettled(
        targets.map(t => this.evaluateProduct(t.id, t.campaignId))
      )

      const applied = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (failed > 0) {
        this.logger.warn(`Pricing cron: ${failed} sản phẩm đánh giá thất bại`)
      }

      this.logger.log(
        `Pricing cron hoàn tất: ${applied} đã đánh giá, ${failed} lỗi`
      )
    } finally {
      // Luôn release lock dù có lỗi hay không
      await this.redis.releaseLockToken(CRON_LOCK_KEY, lockToken)
    }
  }

  /**
   * Đánh giá và áp dụng thay đổi giá cho một campaign product.
   *
   * Luồng:
   * 1. PricingEngineService.evaluate() → phân tích context (stock, velocity, time)
   * 2. Nếu không cần thay đổi (shouldChange = false) → kết thúc sớm
   * 3. Áp dụng giá mới và ghi lịch sử vào DB
   * 4. Broadcast sự kiện PRICE_UPDATE qua Redis Pub/Sub → SSE client nhận ngay
   */
  private async evaluateProduct(
    campaignProductId: string,
    campaignId: string
  ): Promise<void> {
    const decision = await this.pricingEngine.evaluate(campaignProductId)

    if (!decision.shouldChange) {
      return // Không có rule nào kích hoạt hoặc thay đổi < ngưỡng tối thiểu
    }

    await this.pricingEngine.applyDecision(campaignProductId, decision)

    // Thông báo real-time qua Redis Pub/Sub để SSE client cập nhật giá ngay lập tức
    await this.redis.publishDashboardEvent(campaignId, {
      type: 'PRICE_UPDATE',
      campaignProductId,
      oldPrice: decision.oldPrice,
      newPrice: decision.newPrice,
      reason: decision.reason,
      timestamp: new Date().toISOString()
    })

    this.logger.log(
      `Giá đã cập nhật: ${campaignProductId} ` +
        `${decision.oldPrice} → ${decision.newPrice} (${decision.reason})`
    )
  }
}
