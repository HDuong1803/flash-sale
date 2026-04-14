import { Injectable, Logger } from '@nestjs/common'
import { PriceAction, PricingStrategy } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import {
  PricingRepository,
  CampaignProductWithRules
} from '../repositories/pricing.repository'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PricingContext {
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

/** Mức thay đổi tối thiểu để áp dụng (tránh dao động quá nhỏ không đáng kể) */
const MIN_CHANGE_RATIO = 0.01

/** Cửa sổ thời gian tính velocity (phút) */
const VELOCITY_WINDOW_MIN = 5

@Injectable()
export class PricingEngineService {
  private readonly logger = new Logger(PricingEngineService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly pricingRepo: PricingRepository
  ) {}

  /**
   * Đánh giá các rule dynamic pricing cho một campaign product cụ thể.
   *
   * Flow:
   * 1. Fetch product + các rule đang active từ DB
   * 2. Lấy tồn kho real-time từ Redis (fallback: giá trị DB)
   * 3. Tính velocity mua hàng trong 5 phút gần nhất
   * 4. Duyệt các rule theo thứ tự priority, dừng khi tìm thấy rule đầu tiên khớp
   * 5. Áp dụng điều chỉnh, clamp vào guardrail, kiểm tra delta tối thiểu
   *
   * Edge cases:
   * - Campaign đã kết thúc: trả về shouldChange=false
   * - Không có rule active: trả về shouldChange=false
   * - Stock Redis bị mất: dùng remainingQuantity từ DB
   * - Nhiều rule khớp: rule có priority cao nhất thắng (first match)
   * - Giá sau clamp == giá hiện tại: bỏ qua (guardrail ngăn mọi thay đổi)
   * - Delta quá nhỏ (< 1%): bỏ qua để tránh dao động không đáng kể
   */
  async evaluate(campaignProductId: string): Promise<PriceDecision> {
    const product = await this.pricingRepo.findProductWithRules(
      campaignProductId
    )

    if (!product) {
      return { shouldChange: false, reason: 'PRODUCT_NOT_FOUND' }
    }

    if (product.campaign.status !== 'ACTIVE') {
      return { shouldChange: false, reason: 'CAMPAIGN_NOT_ACTIVE' }
    }

    if (product.pricingRules.length === 0) {
      return { shouldChange: false, reason: 'NO_ACTIVE_RULES' }
    }

    const ctx = await this.buildContext(product)

    for (const rule of product.pricingRules) {
      if (!this.matchRule(rule, ctx)) continue

      const action = this.resolveAction(rule)
      if (!action) continue

      const currentPrice = Number(product.salePrice)
      const multiplier =
        action === PriceAction.INCREASE
          ? 1 + rule.adjustmentPct / 100
          : 1 - rule.adjustmentPct / 100

      const rawNewPrice = currentPrice * multiplier
      const clampedPrice = Math.max(
        rule.minPrice,
        Math.min(rule.maxPrice, rawNewPrice)
      )
      const roundedPrice = Math.round(clampedPrice * 100) / 100 // làm tròn 2 chữ số thập phân

      // Bỏ qua nếu delta thay đổi quá nhỏ
      const delta = Math.abs(roundedPrice - currentPrice) / currentPrice
      if (delta < MIN_CHANGE_RATIO) {
        this.logger.debug(
          `Rule ${rule.id} khớp nhưng delta ${(delta * 100).toFixed(
            2
          )}% < min — bỏ qua`
        )
        continue
      }

      // Bỏ qua nếu giá đã ở guardrail và không thể thay đổi thêm
      if (roundedPrice === currentPrice) continue

      this.logger.log(
        `Price decision: ${currentPrice} → ${roundedPrice} (${rule.name}, ` +
          `Δ${(((roundedPrice - currentPrice) / currentPrice) * 100).toFixed(
            1
          )}%)`
      )

      return {
        shouldChange: true,
        oldPrice: currentPrice,
        newPrice: roundedPrice,
        reason: rule.name,
        ruleId: rule.id,
        stockAtChange: ctx.stockRatio * product.saleQuantity,
        velocityAtChange: ctx.velocityPerMin,
        timeRemainingMin: Math.round(ctx.timeRemainingMin)
      }
    }

    return { shouldChange: false, reason: 'NO_RULE_MATCHED' }
  }

  /**
   * Lưu quyết định thay đổi giá đã được duyệt vào DB.
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
      stockAtChange: Math.round(decision.stockAtChange),
      velocityAtChange: decision.velocityAtChange,
      timeRemainingMin: decision.timeRemainingMin
    })
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async buildContext(
    product: CampaignProductWithRules
  ): Promise<PricingContext> {
    // Stock: ưu tiên giá trị real-time từ Redis, fallback về DB nếu Redis không có
    const redisStock = await this.redis.getStock(product.id)
    const stockNow =
      redisStock !== null ? redisStock : product.remainingQuantity
    const stockRatio =
      product.saleQuantity > 0
        ? Math.max(0, stockNow) / product.saleQuantity
        : 0

    // Velocity: số lượt mua mỗi phút trong cửa sổ thời gian gần nhất
    const recentCount = await this.pricingRepo.countRecentReservations(
      product.id,
      VELOCITY_WINDOW_MIN
    )
    const velocityPerMin = recentCount / VELOCITY_WINDOW_MIN

    // Thời gian còn lại của campaign (phút)
    const timeRemainingMin = Math.max(
      0,
      (product.campaign.endTime.getTime() - Date.now()) / 60_000
    )

    return { stockRatio, velocityPerMin, timeRemainingMin }
  }

  private matchRule(rule: PricingRule, ctx: PricingContext): boolean {
    switch (rule.strategy) {
      case PricingStrategy.STOCK_BASED: {
        if (
          rule.stockRatioLow !== null &&
          ctx.stockRatio <= rule.stockRatioLow
        ) {
          return true
        }
        if (
          rule.stockRatioHigh !== null &&
          ctx.stockRatio >= rule.stockRatioHigh
        ) {
          return true
        }
        return false
      }

      case PricingStrategy.VELOCITY_BASED: {
        if (
          rule.velocityMin !== null &&
          ctx.velocityPerMin >= rule.velocityMin
        ) {
          return true
        }
        if (
          rule.velocityMax !== null &&
          ctx.velocityPerMin <= rule.velocityMax
        ) {
          return true
        }
        return false
      }

      case PricingStrategy.TIME_BASED: {
        if (
          rule.minutesBeforeEnd !== null &&
          ctx.timeRemainingMin <= rule.minutesBeforeEnd
        ) {
          return true
        }
        return false
      }

      case PricingStrategy.COMPOSITE: {
        // COMPOSITE: TẤT CẢ điều kiện phải thỏa mãn cùng lúc
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

  private resolveAction(rule: PricingRule): PriceAction | null {
    return rule.stockAction ?? rule.velocityAction ?? rule.timeAction ?? null
  }
}
