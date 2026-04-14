import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger
} from '@nestjs/common'
import { Request } from 'express'
import { FraudService } from './services/fraud.service'
import { extractIp, parseBehaviorSignals } from './rules/fraud-rules'

/**
 * FraudGuard — Chạy fraud evaluation trước khi purchase request đến controller.
 *
 * Áp dụng tại `POST /orders/purchase`.
 *
 * Khi guard throw HttpException, NestJS tự động trả lỗi về client.
 * Request bị BLOCK không bao giờ chạm đến business logic.
 *
 * FLAG (score 0.5-0.75): cho phép nhưng gắn `req.fraudFlag` để handler biết.
 * ALLOW (score < 0.5): xử lý bình thường.
 *
 * Edge cases:
 * - FraudService throw (Redis down, etc.): fail-open → let request through
 *   with a warning log. Better to sell than to block legit users during infra blip.
 * - IP spoofing via X-Forwarded-For: take first IP, documented limitation.
 * - Missing behavior signals: rules that depend on them skip gracefully.
 */
@Injectable()
export class FraudGuard implements CanActivate {
  private readonly logger = new Logger(FraudGuard.name)

  constructor(private readonly fraudService: FraudService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { fraudFlag?: unknown }>()

    const ip = extractIp(
      req.headers['x-forwarded-for'] as string | undefined,
      req.socket?.remoteAddress
    )

    const userAgent = (req.headers['user-agent'] as string | undefined) ?? ''
    const behaviorSignals = parseBehaviorSignals(
      req.headers['x-behavior-signals'] as string | undefined
    )

    // userId có thể undefined nếu guard chạy trước auth (thực tế chạy sau AccessTokenGuard)
    const user = (req as unknown as { user?: { id: string } }).user
    const userId = user?.id

    // campaignId lấy từ body (đã được NestJS body parser xử lý trước khi guard chạy)
    const campaignId = (req.body as { campaignProductId?: string })
      ?.campaignProductId

    let decision
    try {
      decision = await this.fraudService.evaluate({
        ipAddress: ip,
        userId,
        userAgent,
        requestType: 'PURCHASE',
        campaignId,
        behaviorSignals
      })
    } catch (err: unknown) {
      // Fail-open: ghi log và cho request đi qua
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`FraudGuard đánh giá thất bại (fail-open): ${msg}`)
      return true
    }

    if (decision.action === 'BLOCK') {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'FRAUD_DETECTED',
            message: decision.message ?? 'Yêu cầu bị từ chối',
            riskScore: decision.score
          }
        },
        HttpStatus.TOO_MANY_REQUESTS
      )
    }

    if (decision.action === 'FLAG') {
      req.fraudFlag = decision
    }

    return true
  }
}
