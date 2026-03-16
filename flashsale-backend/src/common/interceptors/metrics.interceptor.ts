import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common'
import { Observable } from 'rxjs'

// Metrics interceptor — stub (Prometheus disabled, no-op pass-through)
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
    return next.handle()
  }
}
