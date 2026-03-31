import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger
} from '@nestjs/common'
import type { Request } from 'express'
import { SepayService } from '../services/sepay.service'

@Injectable()
export class SepayWebhookGuard implements CanActivate {
  private readonly logger = new Logger(SepayWebhookGuard.name)

  constructor(private readonly sepayService: SepayService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const authHeader = request.headers['authorization'] as string | undefined

    const valid = this.sepayService.verifyWebhookSignature(authHeader)

    if (!valid) {
      this.logger.warn({
        event: 'sepay_webhook_rejected',
        ip: request.ip
      })
      throw new ForbiddenException('Chữ ký webhook không hợp lệ')
    }

    return true
  }
}
