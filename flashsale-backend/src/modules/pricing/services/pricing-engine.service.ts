import { Injectable, Logger } from '@nestjs/common'
import { PriceAction, PricingStrategy } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import {
  PricingRepository,
  CampaignProductWithRules
} from '../repositories/pricing.repository'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PricingContext {
  stockRatio: number
  velocityPerMin: number
  timeRemainingMin: number
}

interface PricingRule {
  id: string
  name: string
  strategy: PricingStrategy
  priority: number
  stockRatioLow: number | null
  stockRatioHigh: number | null
  stockAction: PriceAction | null
  velocityMin: number | null
  velocityMax: number | null
  velocityAction: PriceAction | null
  minutesBeforeEnd: number | null
  timeAction: PriceAction | null
  adjustmentPct: number
  minPrice: number
  maxPrice: number
}

export type PriceDecision =
  | { shouldChange: false; reason: string }
  | {
      shouldChange: true
      oldPrice: number
      newPrice: number
      reason: string
      ruleId: string
      stockAtChange: number
      velocityAtChange: number
      timeRemainingMin: number
    }

/** Mức thay đổi tối thiểu để áp dụng (tránh dao động không đáng kể) */
const MIN_CHANGE_RATIO = 0.01

/** Cửa sổ thời gian tính velocity (phút) */
const VELOCITY_WINDOW_MIN = 5

/**
 * Thời gian cooldown sau khi giá thay đổi (giây).
 * Ngăn oscillation: nếu tồn kho luôn < 30%, giá không giảm liên tục mỗi 5 phút.
 */
const PRICE_COOLDOWN_SEC = 10 * 60 // 10 phút

@Injectable()
export class PricingEngineService {
  private readonly logger = new Logger(PricingEngineService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly pricingRepo: PricingRepository
  ) {}

  /**
   * Đánh giá pricing cho một sản phẩm cụ thể.
   * Dùng cho admin manual trigger — tự fetch context.
   */
  async evaluate(campaignProductId: string): Promise<PriceDecision> {
    const product = await this.pricingRepo.findProductWithRules(
      campaignProductId
    )

    if (!product) return { shouldChange: false, reason: 'PRODUCT_NOT_FOUND' }
    if (product.campaign.status !== 'ACTIVE')
      return { shouldChange: false, reason: 'CAMPAIGN_NOT_ACTIVE' }
    if (product.pricingRules.length === 0)
      return { shouldChange: false, reason: 'NO_ACTIVE_RULES' }

    // Admin trigger không bị cooldown — intentional manual override
    const [redisStock, velocity] = await Promise.all([
      this.redis.getStock(product.id),
      this.pricingRepo.countRecentReservations(product.id, VELOCITY_WINDOW_MIN)
    ])

    const stock = redisStock !== null ? redisStock : product.remainingQuantity
    const ctx = this.buildContextSync(product, stock, velocity)
    return this.evaluateSync(product, ctx)
  }

  /**
   * Đánh giá pricing với context đã được chuẩn bị sẵn từ bên ngoài.
   * Dùng bởi scheduler để tránh N+1 queries — hoàn toàn synchronous, không I/O.
   *
   * Caller chịu trách nhiệm:
   * - Đã lọc cooldown trước khi gọi
   * - stock và velocity đã được batch-fetch
   */
  evaluateSync(
    product: CampaignProductWithRules,
    ctx: PricingContext
  ): PriceDecision {
    if (product.pricingRules.length === 0) {
      return { shouldChange: false, reason: 'NO_ACTIVE_RULES' }
    }

    const currentPrice = Number(product.salePrice)

    for (const rule of product.pricingRules) {
      if (!this.matchRule(rule, ctx)) continue

      const action = this.resolveAction(rule)
      if (!action) continue

      const multiplier =
        action === PriceAction.INCREASE
          ? 1 + rule.adjustmentPct / 100
          : 1 - rule.adjustmentPct / 100

      const rawNewPrice = currentPrice * multiplier
      const clampedPrice = Math.max(
        rule.minPrice,
        Math.min(rule.maxPrice, rawNewPrice)
      )

      // Làm tròn đến 1000đ — VND không có xu
      const roundedPrice = Math.round(clampedPrice / 1000) * 1000

      // Bỏ qua nếu delta thay đổi quá nhỏ (< 1%)
      const delta = Math.abs(roundedPrice - currentPrice) / currentPrice
      if (delta < MIN_CHANGE_RATIO) {
        this.logger.debug(
          `Rule ${rule.id} khớp nhưng delta ${(delta * 100).toFixed(
            2
          )}% < min — bỏ qua`
        )
        continue
      }

      if (roundedPrice === currentPrice) continue

      return {
        shouldChange: true,
        oldPrice: currentPrice,
        newPrice: roundedPrice,
        reason: rule.name,
        ruleId: rule.id,
        stockAtChange: Math.round(ctx.stockRatio * product.saleQuantity),
        velocityAtChange: ctx.velocityPerMin,
        timeRemainingMin: Math.round(ctx.timeRemainingMin)
      }
    }

    return { shouldChange: false, reason: 'NO_RULE_MATCHED' }
  }

  /**
   * Xây dựng PricingContext từ stock và velocity đã fetch sẵn.
   * Dùng bởi scheduler (batch context) — không có I/O.
   */
  buildContextSync(
    product: CampaignProductWithRules,
    stock: number,
    reservationCount: number
  ): PricingContext {
    const stockRatio =
      product.saleQuantity > 0 ? Math.max(0, stock) / product.saleQuantity : 0

    const velocityPerMin = reservationCount / VELOCITY_WINDOW_MIN

    const timeRemainingMin = Math.max(
      0,
      (product.campaign.endTime.getTime() - Date.now()) / 60_000
    )

    return { stockRatio, velocityPerMin, timeRemainingMin }
  }

  /**
   * Lưu quyết định thay đổi giá vào DB và đặt cooldown.
   */
  async applyDecision(
    campaignProductId: string,
    decision: Extract<PriceDecision, { shouldChange: true }>,
    triggeredBy = 'SYSTEM'
  ): Promise<void> {
    const changePct =
      ((decision.newPrice - decision.oldPrice) / decision.oldPrice) * 100

    await this.pricingRepo.applyPriceChange(campaignProductId, {
      campaignProductId,
      ruleId: decision.ruleId,
      oldPrice: decision.oldPrice,
      newPrice: decision.newPrice,
      changePct,
      reason: decision.reason,
      triggeredBy,
      stockAtChange: decision.stockAtChange,
      velocityAtChange: decision.velocityAtChange,
      timeRemainingMin: decision.timeRemainingMin
    })

    // Admin trigger không cần cooldown
    if (triggeredBy === 'SYSTEM') {
      await this.redis.setPricingCooldown(campaignProductId, PRICE_COOLDOWN_SEC)
    }

    this.logger.log(
      `Giá cập nhật [${triggeredBy}]: ${campaignProductId} ` +
        `${decision.oldPrice} → ${decision.newPrice} (${decision.reason})`
    )
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private matchRule(rule: PricingRule, ctx: PricingContext): boolean {
    switch (rule.strategy) {
      case PricingStrategy.STOCK_BASED: {
        // stockRatioLow: trigger khi hàng sắp hết (stock ≤ ngưỡng thấp)
        if (rule.stockRatioLow !== null && ctx.stockRatio <= rule.stockRatioLow)
          return true
        // stockRatioHigh: trigger khi hàng dư nhiều (stock ≥ ngưỡng cao)
        if (
          rule.stockRatioHigh !== null &&
          ctx.stockRatio >= rule.stockRatioHigh
        )
          return true
        return false
      }

      case PricingStrategy.VELOCITY_BASED: {
        // velocityMin: trigger khi bán chạy (velocity ≥ min) → thường INCREASE
        if (rule.velocityMin !== null && ctx.velocityPerMin >= rule.velocityMin)
          return true
        // velocityMax: trigger khi bán chậm (velocity ≤ max, và max > 0) → thường DECREASE
        if (
          rule.velocityMax !== null &&
          rule.velocityMax > 0 &&
          ctx.velocityPerMin <= rule.velocityMax
        ) {
          return true
        }
        return false
      }

      case PricingStrategy.TIME_BASED: {
        // Trigger khi còn ít thời gian (time ≤ minutesBeforeEnd)
        if (
          rule.minutesBeforeEnd !== null &&
          ctx.timeRemainingMin <= rule.minutesBeforeEnd
        ) {
          return true
        }
        return false
      }

      case PricingStrategy.COMPOSITE: {
        // TẤT CẢ điều kiện được cấu hình phải thỏa mãn cùng lúc
        const stockOk =
          rule.stockRatioLow === null || ctx.stockRatio <= rule.stockRatioLow
        const velocityOk =
          rule.velocityMin === null || ctx.velocityPerMin >= rule.velocityMin
        const timeOk =
          rule.minutesBeforeEnd === null ||
          ctx.timeRemainingMin <= rule.minutesBeforeEnd
        return stockOk && velocityOk && timeOk
      }

      default:
        return false
    }
  }

  /**
   * Fix bug: resolveAction phải trả về đúng action theo strategy.
   * Trước đây dùng fallback chain ?? có thể trả về velocityAction cho STOCK_BASED rule.
   */
  private resolveAction(rule: PricingRule): PriceAction | null {
    switch (rule.strategy) {
      case PricingStrategy.STOCK_BASED:
        return rule.stockAction ?? null
      case PricingStrategy.VELOCITY_BASED:
        return rule.velocityAction ?? null
      case PricingStrategy.TIME_BASED:
        return rule.timeAction ?? null
      case PricingStrategy.COMPOSITE:
        // COMPOSITE dùng action đầu tiên có giá trị (merchant chỉ cần set 1 cái)
        return (
          rule.stockAction ?? rule.velocityAction ?? rule.timeAction ?? null
        )
      default:
        return null
    }
  }
}
