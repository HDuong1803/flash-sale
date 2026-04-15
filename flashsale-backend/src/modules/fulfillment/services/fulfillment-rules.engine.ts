import { Injectable, Logger } from '@nestjs/common'
import { FulfillmentRuleWithCarrier } from '../repositories/fulfillment.repository'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FulfillmentContext {
  /** Weight in grams */
  weightGrams: number
  /** Total order amount in cents (USD) */
  orderValueCents: number
  /** ISO 3166-1 alpha-2 country code */
  destCountry: string
  /** US state abbreviation (2 chars), null for non-US */
  destState: string | null
}

export type FulfillmentDecision =
  | {
      matched: true
      carrierId: string
      carrierCode: string
      carrierName: string
      slaHours: number
      ruleName: string
      ruleId: string
    }
  | {
      matched: false
      reason: 'NO_ACTIVE_RULES' | 'NO_RULE_MATCHED'
    }

/**
 * FulfillmentRulesEngine — Pure synchronous rules evaluation.
 *
 * Architecture mirror của PricingEngineService:
 * - evaluateSync() không có I/O — caller chịu trách nhiệm fetch rules trước
 * - Rules được sort theo priority DESC khi load từ DB
 * - First match wins (không accumulate)
 * - AND logic: tất cả non-null conditions đều phải thỏa mãn
 *
 * Fallback strategy: nếu không có rule nào match, FulfillmentService
 * sẽ dùng carrier đầu tiên trong DB (default USPS).
 */
@Injectable()
export class FulfillmentRulesEngine {
  private readonly logger = new Logger(FulfillmentRulesEngine.name)

  /**
   * evaluateSync — Evaluate carrier selection từ context và rules đã load sẵn.
   *
   * Pure function: không có DB/Redis I/O.
   * Caller (FulfillmentService) chịu trách nhiệm fetch rules.
   *
   * @param rules - Active rules sorted by priority DESC (từ FulfillmentRepository)
   * @param ctx - Fulfillment context (weight, order value, destination)
   */
  evaluateSync(
    rules: FulfillmentRuleWithCarrier[],
    ctx: FulfillmentContext
  ): FulfillmentDecision {
    if (rules.length === 0) {
      return { matched: false, reason: 'NO_ACTIVE_RULES' }
    }

    for (const rule of rules) {
      if (!this.matchRule(rule, ctx)) continue

      this.logger.debug(
        `Rule matched: "${rule.name}" → carrier ${rule.carrier.code}, SLA ${rule.slaHours}h`
      )

      return {
        matched: true,
        carrierId: rule.carrier.id,
        carrierCode: rule.carrier.code,
        carrierName: rule.carrier.displayName,
        slaHours: rule.slaHours,
        ruleName: rule.name,
        ruleId: rule.id
      }
    }

    return { matched: false, reason: 'NO_RULE_MATCHED' }
  }

  /**
   * buildContext — Tạo FulfillmentContext từ raw order data.
   * Xử lý edge cases: missing weight → default 500g, missing country → "US".
   */
  buildContext(params: {
    weightGrams?: number | null
    orderTotalCents: number
    shippingAddress: string
  }): FulfillmentContext {
    const parsed = this.parseAddressCountryState(params.shippingAddress)

    return {
      weightGrams: params.weightGrams ?? 500, // default 500g nếu không có thông tin
      orderValueCents: params.orderTotalCents,
      destCountry: parsed.country,
      destState: parsed.state
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * matchRule — AND logic: tất cả configured conditions phải thỏa mãn.
   *
   * null condition = "don't care" — luôn pass.
   * Đây là pattern standard cho rules engines (Drools, Cedar, etc.)
   */
  private matchRule(
    rule: FulfillmentRuleWithCarrier,
    ctx: FulfillmentContext
  ): boolean {
    // Weight conditions
    if (rule.minWeightGrams !== null && ctx.weightGrams < rule.minWeightGrams) {
      return false
    }
    if (rule.maxWeightGrams !== null && ctx.weightGrams > rule.maxWeightGrams) {
      return false
    }

    // Order value conditions (cents)
    if (
      rule.minOrderCents !== null &&
      ctx.orderValueCents < rule.minOrderCents
    ) {
      return false
    }
    if (
      rule.maxOrderCents !== null &&
      ctx.orderValueCents > rule.maxOrderCents
    ) {
      return false
    }

    // Destination country (case-insensitive)
    if (
      rule.destCountry !== null &&
      rule.destCountry.toUpperCase() !== ctx.destCountry.toUpperCase()
    ) {
      return false
    }

    // Destination state (only checked when country matches or not set)
    if (rule.destState !== null) {
      if (!ctx.destState) return false
      if (rule.destState.toUpperCase() !== ctx.destState.toUpperCase()) {
        return false
      }
    }

    return true
  }

  /**
   * parseAddressCountryState — Heuristic parse country + state từ địa chỉ string.
   *
   * Current system lưu shippingAddress là free text string.
   * Heuristic:
   * - Nếu có ", US" hoặc ", USA" ở cuối → US
   * - Tìm 2-letter state code trong chuỗi
   * - Default về US nếu không rõ (phù hợp với JD target market)
   *
   * Sprint 3 improvement: structured address trong checkout DTO.
   */
  private parseAddressCountryState(address: string): {
    country: string
    state: string | null
  } {
    // Try JSON parse first (nếu address là JSON object)
    try {
      const parsed = JSON.parse(address) as Record<string, unknown>
      const country =
        typeof parsed['country'] === 'string'
          ? parsed['country'].toUpperCase()
          : 'US'
      const state =
        typeof parsed['state'] === 'string'
          ? parsed['state'].toUpperCase()
          : null
      return { country, state }
    } catch {
      // Not JSON, try string heuristics
    }

    // US state abbreviation pattern (e.g. "Los Angeles, CA 90001")
    const stateMatch = /\b([A-Z]{2})\s+\d{5}/.exec(address.toUpperCase())
    if (stateMatch) {
      return { country: 'US', state: stateMatch[1] }
    }

    // Default to US
    return { country: 'US', state: null }
  }
}
