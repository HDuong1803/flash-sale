import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common'
import { Request } from 'express'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { IUserFromRequest } from '@common/decorators/current-user.decorator'
import { ActivityLogService } from './activity-log.service'
import { matchRoute } from './activity-log.config'

/**
 * ActivityLogInterceptor — global HTTP interceptor that writes UserActionLog
 * entries for key user actions after a successful 2xx response.
 *
 * Works by tapping into the response observable:
 * - `tap` runs only on successful emissions (not on errors)
 * - Logging is fire-and-forget — never blocks the response stream
 * - Skips WebSocket and RPC contexts automatically
 *
 * IP extraction priority:
 *   1. X-Forwarded-For first header (behind load balancer / reverse proxy)
 *   2. req.socket.remoteAddress fallback
 */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(private readonly activityLogService: ActivityLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle()
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: IUserFromRequest }>()

    const route = matchRoute(req.method, req.path)
    if (!route) return next.handle()

    return next.handle().pipe(
      tap(() => {
        const userId = req.user?.userId ?? null
        const ip = extractClientIp(req)
        const targetId = route.extractTargetId?.(req.path) ?? null

        this.activityLogService.log({
          action: route.action,
          userId,
          ip,
          targetId
        })
      })
    )
  }
}

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      .split(',')[0]
      ?.trim()
    if (first) return first
  }
  return req.socket?.remoteAddress ?? null
}
