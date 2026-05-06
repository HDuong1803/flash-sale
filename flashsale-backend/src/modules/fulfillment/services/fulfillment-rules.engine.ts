import { Injectable, Logger } from '@nestjs/common'
import { FulfillmentRuleWithCarrier } from '../repositories/fulfillment.repository'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FulfillmentContext {
  /** Weight in grams */
  weightGrams: number
  /** Total order amount in cents (VND quy đổi cents để đồng nhất logic) */
  orderValueCents: number
  /**
   * Province ID của địa chỉ đích (GHN numeric ID).
   * Ví dụ: 202 = Hồ Chí Minh, 201 = Hà Nội
   * null nếu không parse được.
   */
  destProvinceId: number | null
  /**
   * District ID của địa chỉ đích (GHN numeric ID).
   * Ví dụ: 1442 = Quận 1 HCM
   * null nếu không parse được.
   */
  destDistrictId: number | null
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
 * sẽ dùng GHN Express (service_type_id=2) làm default.
 *
 * Note: destCountry và destState columns trong FulfillmentRule hiện tại
 * dùng để lưu provinceId và districtId cho thị trường VN.
 * Quy ước: destCountry = "VN" (hoặc null cho any), destState = province_id string.
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
   * Xử lý edge cases: missing weight → default 500g.
   */
  buildContext(params: {
    weightGrams?: number | null
    orderTotalCents: number
    shippingAddress: string
  }): FulfillmentContext {
    const parsed = this.parseAddressIds(params.shippingAddress)

    return {
      weightGrams: params.weightGrams ?? 500, // default 500g nếu không có thông tin
      orderValueCents: params.orderTotalCents,
      destProvinceId: parsed.provinceId,
      destDistrictId: parsed.districtId
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * matchRule — AND logic: tất cả configured conditions phải thỏa mãn.
   *
   * null condition = "don't care" — luôn pass.
   * Đây là pattern standard cho rules engines (Drools, Cedar, etc.)
   *
   * Mapping destCountry/destState → GHN VN context:
   * - destCountry = "VN" → match tất cả VN (hoặc null = any)
   * - destState = province_id string (e.g. "202") → match tỉnh cụ thể
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

    // destCountry check — "VN" matches all Vietnam orders; null = any
    if (rule.destCountry !== null) {
      const ruleCountry = rule.destCountry.toUpperCase()
      if (ruleCountry !== 'VN') {
        // Non-VN rule — skip (GHN chỉ ship VN)
        return false
      }
    }

    // destState = province_id (e.g. "202" for HCM)
    if (rule.destState !== null) {
      if (ctx.destProvinceId === null) return false
      const ruleProvinceId = parseInt(rule.destState, 10)
      if (isNaN(ruleProvinceId) || ruleProvinceId !== ctx.destProvinceId) {
        return false
      }
    }

    return true
  }

  /**
   * parseAddressIds — Parse province_id và district_id từ JSON address string.
   *
   * GHN address lưu dạng JSON:
   * { "to_ward_code": "20314", "to_district_id": 1442, ... }
   *
   * Fallback: null nếu không parse được (rule condition vẫn có thể pass nếu destState null).
   */
  private parseAddressIds(address: string): {
    provinceId: number | null
    districtId: number | null
  } {
    try {
      const parsed = JSON.parse(address) as Record<string, unknown>

      const districtId =
        typeof parsed['to_district_id'] === 'number'
          ? parsed['to_district_id']
          : typeof parsed['to_district_id'] === 'string'
          ? parseInt(parsed['to_district_id'], 10)
          : null

      // province_id không bắt buộc trong GHN address — có thể suy từ ward/district
      const provinceId =
        typeof parsed['to_province_id'] === 'number'
          ? parsed['to_province_id']
          : typeof parsed['to_province_id'] === 'string'
          ? parseInt(parsed['to_province_id'], 10)
          : null

      return {
        provinceId: provinceId && !isNaN(provinceId) ? provinceId : null,
        districtId: districtId && !isNaN(districtId) ? districtId : null
      }
    } catch {
      return { provinceId: null, districtId: null }
    }
  }
}
