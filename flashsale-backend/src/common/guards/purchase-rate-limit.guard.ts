import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable
} from '@nestjs/common'
import { RateLimiterRedis } from 'rate-limiter-flexible'
import { RedisService } from '@infrastructure/redis/redis.service'

@Injectable()
export class PurchaseRateLimitGuard implements CanActivate {
  private readonly limiter: RateLimiterRedis

  constructor(private readonly redis: RedisService) {
    this.limiter = new RateLimiterRedis({
      storeClient: this.redis.client,
      keyPrefix: 'rl:purchase',
      points: 5, // max 5 requests
      duration: 10 // per 10 seconds per userId
    })
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user: { userId: string } }>()
    try {
      await this.limiter.consume(request.user.userId)
      return true
    } catch {
      throw new HttpException(
        {
          message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 10 giây.',
          retryAfter: 10
        },
        HttpStatus.TOO_MANY_REQUESTS
      )
    }
  }
}
