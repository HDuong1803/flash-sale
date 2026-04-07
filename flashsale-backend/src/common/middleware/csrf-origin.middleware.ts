import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response, NextFunction } from 'express'

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * CSRF protection — Origin header validation.
 *
 * Với cookie-based auth và SameSite=None (cần thiết cho cross-domain),
 * kiểm tra Origin header của request để chặn cross-site forgery.
 *
 * Loại trừ:
 * - GET/HEAD/OPTIONS (read-only, không thay đổi state)
 * - Webhook endpoints (có xác thực signature riêng)
 * - Requests không có Origin (server-to-server, mobile app)
 */
@Injectable()
export class CsrfOriginMiddleware implements NestMiddleware {
  private readonly allowedOrigins: string[]

  constructor(private readonly configService: ConfigService) {
    this.allowedOrigins = [
      this.configService.get<string>(
        'application.CLIENT_URL_SERVER',
        'http://localhost:3000'
      ),
      this.configService.get<string>('application.BACKEND_URL_SERVER', ''),
      this.configService.get<string>('application.CLIENT_URL_LOCAL', ''),
      this.configService.get<string>('application.BACKEND_URL_LOCAL', '')
    ]
      .filter(Boolean)
      .map(o => o.replace(/\/$/, ''))
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!STATE_CHANGING_METHODS.has(req.method)) {
      return next()
    }

    // Webhook endpoints có signature verification riêng — không cần CSRF check
    if (req.path.includes('/webhook')) {
      return next()
    }

    const origin = req.headers['origin'] as string | undefined

    // Không có Origin header: server-to-server hoặc mobile — cho phép
    if (!origin) {
      return next()
    }

    const normalizedOrigin = origin.replace(/\/$/, '')
    if (!this.allowedOrigins.includes(normalizedOrigin)) {
      throw new ForbiddenException('CSRF: Origin không hợp lệ')
    }

    next()
  }
}
