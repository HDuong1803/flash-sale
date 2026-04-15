import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger
} from '@nestjs/common'
import { Request } from 'express'
import { IUserFromRequest } from '@common/decorators/current-user.decorator'
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

    // Priority 1: User's real IP from load balancer if properly configured
    // Since X-Forwarded-For can contain a comma-separated list of IPs, we take the first one
    // In production, you should run behind a reverse proxy that guarantees X-Forwarded-For is set correctly
    const xForwardedFor = req.headers['x-forwarded-for'] as string | undefined
    // For better security, limit x-forwarded-for trust only to known proxy IPs, this is simple implementation
    const ip = extractIp(
      xForwardedFor?.split(',')[0].trim(),
      req.socket?.remoteAddress
    )

    const userAgent = (req.headers['user-agent'] as string | undefined) ?? ''
    const behaviorSignals = parseBehaviorSignals(
      req.headers['x-behavior-signals'] as string | undefined
    )

    // userId có thể undefined nếu guard chạy trước auth (thực tế chạy sau AccessTokenGuard)
    const user = (req as unknown as { user?: IUserFromRequest }).user
    const userId = user?.userId

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
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`FraudGuard đánh giá thất bại: ${msg}`)

      // FAIL-CLOSED: Thay vì fail-open, chặn request do không thể đánh giá được rủi ro fraud
      throw new HttpException(
        {
          success: false,
          error: 'Fraud detection system is currently unavailable',
          message: 'Hệ thống bảo mật đang bị gián đoạn, vui lòng thử lại sau.'
        },
        HttpStatus.SERVICE_UNAVAILABLE
      )
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
