import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { RedisService } from '@infrastructure/redis/redis.service'
import { PricingRepository } from '../repositories/pricing.repository'
import { PricingEngineService } from './pricing-engine.service'

const CRON_LOCK_KEY = 'pricing:cron:lock'
/** TTL lock 4 phút < chu kỳ 5 phút — tự hết hạn nếu process crash */
const CRON_LOCK_TTL_S = 240
const LOCK_HEARTBEAT_INTERVAL_MS = 60_000
/** Cửa sổ velocity (phút) — phải đồng bộ với engine */
const VELOCITY_WINDOW_MIN = 5

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
   * Tối ưu I/O (so với cũ):
   *   Trước: (2N+1) DB queries + N Redis calls per cycle
   *   Sau:   2 DB queries + 2 Redis calls per cycle (không phụ thuộc N)
   *
   * Flow:
   * 1. Acquire distributed lock (chỉ 1 instance chạy)
   * 2. Batch fetch: tất cả products + rules (1 DB query)
   * 3. Lọc cooldown bằng Redis MGET (1 Redis call)
   * 4. Batch fetch: velocity tất cả products (1 DB query)
   * 5. Batch fetch: stock tất cả products (1 Redis MGET)
   * 6. Đánh giá từng product — synchronous, không I/O
   * 7. Chỉ ghi DB + publish cho products cần thay đổi
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runPricingCycle(): Promise<void> {
    const lockToken = await this.redis.acquireLockToken(
      CRON_LOCK_KEY,
      CRON_LOCK_TTL_S * 1000
    )

    if (!lockToken) {
      this.logger.debug('Pricing cron: instance khác đang chạy, bỏ qua')
      return
    }

    const stopHeartbeat = this.startLockHeartbeat(lockToken)

    try {
      // ── Step 1: Batch fetch products + rules (1 DB query) ─────────────────
      const allProducts =
        await this.pricingRepo.findAllActivePricingTargetsWithRules()

      if (allProducts.length === 0) {
        this.logger.debug('Pricing cron: không có sản phẩm nào cần định giá')
        return
      }

      const ids = allProducts.map(p => p.id)

      // ── Step 2: Lọc cooldown (1 Redis MGET) ───────────────────────────────
      const onCooldown = await this.redis.filterCooldownIds(ids)
      const eligibleProducts = allProducts.filter(p => !onCooldown.has(p.id))

      if (eligibleProducts.length === 0) {
        this.logger.debug(
          `Pricing cron: tất cả ${allProducts.length} sản phẩm đang trong cooldown`
        )
        return
      }

      const eligibleIds = eligibleProducts.map(p => p.id)

      // ── Step 3: Batch fetch velocity + stock (1 DB query + 1 Redis MGET) ──
      const [velocityMap, stocks] = await Promise.all([
        this.pricingRepo.countRecentReservationsBatch(
          eligibleIds,
          VELOCITY_WINDOW_MIN
        ),
        this.redis.mgetStocks(eligibleIds)
      ])

      this.logger.log(
        `Pricing cron: đánh giá ${eligibleProducts.length}/${allProducts.length} sản phẩm` +
          (onCooldown.size > 0 ? ` (${onCooldown.size} đang cooldown)` : '')
      )

      // ── Step 4: Evaluate + apply (chỉ I/O cho sản phẩm cần thay đổi) ─────
      const results = await Promise.allSettled(
        eligibleProducts.map((product, i) => {
          const stock = stocks[i] ?? product.remainingQuantity
          const reservationCount = velocityMap.get(product.id) ?? 0
          const ctx = this.pricingEngine.buildContextSync(
            product,
            stock,
            reservationCount
          )
          const decision = this.pricingEngine.evaluateSync(product, ctx)

          if (!decision.shouldChange) return Promise.resolve()
          return this.applyAndPublish(product.id, product.campaignId, decision)
        })
      )

      const changed = results.filter(
        r => r.status === 'fulfilled' && r.value !== undefined
      ).length
      const failed = results.filter(r => r.status === 'rejected').length

      if (failed > 0) {
        this.logger.warn(`Pricing cron: ${failed} sản phẩm apply thất bại`)
      }

      this.logger.log(
        `Pricing cron hoàn tất: ${changed} giá thay đổi, ${
          eligibleProducts.length - changed - failed
        } không đổi, ${failed} lỗi`
      )
    } finally {
      stopHeartbeat()
      await this.redis.releaseLockToken(CRON_LOCK_KEY, lockToken)
    }
  }

  /**
   * Apply giá mới + publish PRICE_UPDATE event.
   * Chỉ gọi khi decision.shouldChange = true.
   */
  private async applyAndPublish(
    campaignProductId: string,
    campaignId: string,
    decision: Extract<
      Awaited<ReturnType<PricingEngineService['evaluateSync']>>,
      { shouldChange: true }
    >
  ): Promise<void> {
    await this.pricingEngine.applyDecision(campaignProductId, decision)

    await this.redis.publishDashboardEvent(campaignId, {
      type: 'PRICE_UPDATE',
      campaignProductId,
      oldPrice: decision.oldPrice,
      newPrice: decision.newPrice,
      reason: decision.reason,
      timestamp: new Date().toISOString()
    })
  }

  private startLockHeartbeat(token: string): () => void {
    const interval = setInterval(() => {
      void this.redis
        .extendLockToken(CRON_LOCK_KEY, token, CRON_LOCK_TTL_S * 1000)
        .then(extended => {
          if (!extended) {
            this.logger.warn('Pricing cron lock không thể gia hạn')
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          this.logger.warn(`Lỗi gia hạn pricing lock: ${msg}`)
        })
    }, LOCK_HEARTBEAT_INTERVAL_MS)

    return () => clearInterval(interval)
  }
}
