import { Injectable, Logger } from '@nestjs/common'
import { RedisService } from '@infrastructure/redis/redis.service'
import { FraudRepository } from '../repositories/fraud.repository'
import {
  FRAUD_RULES,
  FraudContext,
  BehaviorSignals
} from '../rules/fraud-rules'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FraudAction = 'ALLOW' | 'FLAG' | 'BLOCK'

export interface FraudDecision {
  action: FraudAction
  score: number
  /** ID rule gây ra block/flag, null nếu được phép */
  reason: string | null
  /** Thông báo hiển thị cho user khi bị block */
  message: string | null
  triggeredRules: string[]
}

export interface EvaluateParams {
  ipAddress: string
  userId?: string
  userAgent: string
  requestType: string
  campaignId?: string
  behaviorSignals?: BehaviorSignals
}

// ─── Thresholds ────────────────────────────────────────────────────────────────

/** Score >= this → block the request outright */
const BLOCK_THRESHOLD = 0.75

/** Score >= this → allow but flag for monitoring */
const FLAG_THRESHOLD = 0.5
const PERMANENT_BLACKLIST_CACHE_SECONDS = 300

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly fraudRepo: FraudRepository
  ) {}

  /**
   * Đánh giá mức độ gian lận của một request.
   *
   * Các rule chạy tuần tự theo thứ tự khai báo.
   * Dừng sớm khi tổng score đạt 1.0 (chắc chắn block).
   *
   * Sự kiện được ghi bất đồng bộ qua setImmediate để không làm chậm
   * critical path của luồng mua hàng.
   *
   * Edge cases:
   * - Lỗi Redis trong rule: từng rule bắt lỗi và trả về false
   *   (chính sách fail-open — tốt hơn là cho phép user hợp lệ qua thay vì block nhầm)
   * - Request chưa xác thực: các rule yêu cầu userId sẽ tự bỏ qua
   */
  async evaluate(params: EvaluateParams): Promise<FraudDecision> {
    const blacklisted = await this.isIpBlacklisted(params.ipAddress)
    if (blacklisted) {
      return {
        action: 'BLOCK',
        score: 1,
        reason: 'IP_BLACKLIST',
        message:
          'Yêu cầu bị từ chối do phát hiện hoạt động bất thường. Vui lòng thử lại sau.',
        triggeredRules: ['IP_BLACKLIST']
      }
    }

    const triggeredRules: string[] = []
    let compositeScore = 0

    const ctx: FraudContext = {
      ipAddress: params.ipAddress,
      userId: params.userId,
      userAgent: params.userAgent,
      requestType: params.requestType,
      campaignId: params.campaignId,
      behaviorSignals: params.behaviorSignals
    }

    // Run rules, short-circuit when capped at 1.0
    for (const rule of FRAUD_RULES) {
      if (compositeScore >= 1.0) break

      let violated = false
      try {
        violated = await rule.check(ctx, this.redis.client)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(
          `Fraud rule ${rule.id} threw: ${msg} — skipping (fail-open)`
        )
        violated = false
      }

      if (violated) {
        triggeredRules.push(rule.id)
        compositeScore = Math.min(1.0, compositeScore + rule.score)
      }
    }

    // Record asynchronously — do not block the response
    setImmediate(() => {
      void this.recordEvent(params, compositeScore, triggeredRules)
    })

    if (compositeScore >= BLOCK_THRESHOLD) {
      this.logger.debug(
        `FRAUD BLOCK: ip=${params.ipAddress} user=${params.userId ?? 'anon'} ` +
          `score=${compositeScore.toFixed(2)} rules=[${triggeredRules.join(
            ','
          )}]`
      )
      return {
        action: 'BLOCK',
        score: compositeScore,
        reason: triggeredRules[0] ?? null,
        message:
          'Yêu cầu bị từ chối do phát hiện hoạt động bất thường. Vui lòng thử lại sau.',
        triggeredRules
      }
    }

    if (compositeScore >= FLAG_THRESHOLD) {
      return {
        action: 'FLAG',
        score: compositeScore,
        reason: triggeredRules[0] ?? null,
        message: null,
        triggeredRules
      }
    }

    return {
      action: 'ALLOW',
      score: compositeScore,
      reason: null,
      message: null,
      triggeredRules
    }
  }

  /**
   * Ghi kết quả đánh giá fraud vào DB cho audit và admin dashboard.
   * Được gọi qua setImmediate — không được throw (mọi lỗi được swallow và log).
   */
  private async recordEvent(
    params: EvaluateParams,
    riskScore: number,
    triggeredRules: string[]
  ): Promise<void> {
    const blocked = riskScore >= BLOCK_THRESHOLD

    try {
      await this.fraudRepo.createEvent({
        userId: params.userId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        requestType: params.requestType,
        riskScore,
        blocked,
        blockReason: blocked ? triggeredRules[0] ?? null : null,
        triggeredRules,
        signals:
          (params.behaviorSignals as unknown as Record<string, unknown>) ?? {},
        campaignId: params.campaignId
      })

      if (params.userId) {
        await this.fraudRepo.upsertRiskProfile(
          params.userId,
          riskScore,
          blocked
        )
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Failed to record fraud event: ${msg}`)
    }
  }

  // ─── Admin operations ─────────────────────────────────────────────────────

  async getStats(since: Date) {
    return this.fraudRepo.getStats(since)
  }

  async getEvents(query: { page?: number; limit?: number; blocked?: boolean }) {
    return this.fraudRepo.getEvents(query)
  }

  async getBlacklist() {
    return this.fraudRepo.getBlacklist()
  }

  async blacklistIp(
    ip: string,
    reason: string,
    adminId: string,
    hours?: number
  ): Promise<void> {
    await this.fraudRepo.addToBlacklist(ip, reason, adminId, hours)
    // Đồng thời set Redis flag để kiểm tra nhanh trong bộ nhớ cho request tiếp theo
    const key = `fraud:blacklist:${ip}`
    if (hours) {
      await this.redis.client.set(key, '1', 'EX', hours * 3600)
    } else {
      // Vĩnh viễn: set TTL rất dài (1 năm) vì Redis không hỗ trợ PERSIST trực tiếp
      await this.redis.client.set(key, '1', 'EX', 365 * 24 * 3600)
    }
    this.logger.log(
      `IP blacklisted: ${ip} by ${adminId}${
        hours ? ` for ${hours}h` : ' permanently'
      }`
    )
  }

  async removeFromBlacklist(ip: string): Promise<void> {
    await this.fraudRepo.removeFromBlacklist(ip)
    await this.redis.client.del(`fraud:blacklist:${ip}`)
    this.logger.log(`IP removed from blacklist: ${ip}`)
  }

  private async isIpBlacklisted(ipAddress: string): Promise<boolean> {
    const redisKey = `fraud:blacklist:${ipAddress}`

    try {
      const cached = await this.redis.client.exists(redisKey)
      if (cached === 1) {
        return true
      }

      const fromDb = await this.fraudRepo.findActiveBlacklistEntry(ipAddress)
      if (fromDb) {
        const ttlSeconds = fromDb.expiresAt
          ? Math.max(
              1,
              Math.ceil((fromDb.expiresAt.getTime() - Date.now()) / 1000)
            )
          : PERMANENT_BLACKLIST_CACHE_SECONDS

        await this.redis.client.set(redisKey, '1', 'EX', ttlSeconds)
        return true
      }

      return false
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(
        `Không thể kiểm tra blacklist cho IP ${ipAddress}: ${msg}`
      )
      return false
    }
  }
}
