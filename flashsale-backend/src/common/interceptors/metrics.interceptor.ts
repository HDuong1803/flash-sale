import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Request, Response } from 'express'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import * as Sentry from '@sentry/nestjs'

/**
 * MetricsInterceptor — đo và log thời gian xử lý mỗi HTTP request.
 *
 * Chức năng:
 * 1. Structured log mỗi request: method, url, statusCode, durationMs
 * 2. WARN khi request chậm hơn threshold (default: 1000ms)
 * 3. Sentry breadcrumb cho slow requests — dễ correlate với user session
 * 4. Header `X-Response-Time` để load balancer / frontend đo được latency
 *
 * Logs này được thu thập bởi Pino → có thể đẩy vào Loki/CloudWatch để
 * query và visualize latency distribution theo từng endpoint.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MetricsInterceptor.name)
  private readonly slowRequestThresholdMs: number

  constructor(private readonly configService: ConfigService) {
    this.slowRequestThresholdMs = this.configService.get<number>('timeouts.this.slowRequestThresholdMs', 1000)
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Chỉ đo HTTP context (bỏ qua WebSocket, RPC, ...)
    if (context.getType() !== 'http') {
      return next.handle()
    }

    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()
    const { method, url } = req
    const start = Date.now()

    // Bỏ qua health check — load balancer gọi liên tục gây noise trong logs
    if (url === '/' || url === '/health') {
      return next.handle()
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - start
          const statusCode = res.statusCode

          // Header cho reverse proxy / frontend monitoring
          res.setHeader('X-Response-Time', `${durationMs}ms`)

          const payload = {
            event: 'http_request',
            method,
            url,
            statusCode,
            durationMs
          }

          if (durationMs > this.slowRequestThresholdMs) {
            // ⚠️ Slow request: có thể là DB N+1 query, missing index, hoặc heavy computation
            this.logger.warn({
              ...payload,
              alert: `Slow: ${durationMs}ms > threshold ${this.slowRequestThresholdMs}ms`
            })
            // Gửi lên Sentry để aggregate slow requests theo endpoint
            Sentry.addBreadcrumb({
              category: 'performance.slow_request',
              message: `Slow ${method} ${url} — ${durationMs}ms`,
              level: 'warning',
              data: payload
            })
          } else {
            this.logger.log(payload)
          }
        },
        error: (err: unknown) => {
          // Lỗi đã được xử lý bởi GlobalExceptionFilter
          // Ở đây chỉ log timing để có đầy đủ context cho debug
          this.logger.error({
            event: 'http_request_error',
            method,
            url,
            durationMs: Date.now() - start,
            error: err instanceof Error ? err.message : 'Unknown error'
          })
        }
      })
    )
  }
}
