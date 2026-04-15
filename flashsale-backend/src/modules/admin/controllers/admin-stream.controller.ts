import { Controller, Get, HttpStatus, Sse, UseGuards } from '@nestjs/common'
import { Observable, merge, timer, from, of } from 'rxjs'
import { switchMap, map, catchError, filter } from 'rxjs/operators'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { AdminGuard } from '@common/guards/admin.guard'
import { RedisService } from '@infrastructure/redis/redis.service'
import { AdminService } from '../services/admin.service'

const moduleName = 'admin'

/**
 * Tách riêng khỏi AdminController để tránh ResponseInterceptor
 * bao bọc SSE Observable stream.
 */
@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminStreamController {
  constructor(
    private readonly adminService: AdminService,
    private readonly redis: RedisService
  ) {}

  @ApiOperation({
    summary: 'SSE stream — giám sát hệ thống admin thời gian thực',
    description:
      'Phát sự kiện: system_health (15s), queue_stats (10s), admin_stats (20s), heartbeat (30s)'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'SSE stream — dữ liệu JSON với trường `type` và `data`'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Chỉ ADMIN' })
  @Get('stream')
  @Sse()
  stream(): Observable<MessageEvent> {
    const emit = (type: string, data: unknown): MessageEvent =>
      ({ data: JSON.stringify({ type, data }) }) as MessageEvent

    // SLA alerts từ FulfillmentSlaService publish qua Redis channel dashboard:admin
    const slaEvents$ = new Observable<MessageEvent>(observer => {
      const subscriber = this.redis.client.duplicate()

      subscriber.subscribe('dashboard:admin', err => {
        if (err) observer.error(err)
      })

      subscriber.on('message', (_channel: string, message: string) => {
        try {
          const payload = JSON.parse(message) as {
            type?: string
            [k: string]: unknown
          }
          const eventType = payload.type ?? 'admin_event'
          observer.next(emit(eventType, payload))
        } catch {
          // Skip malformed payload
        }
      })

      return () => {
        subscriber.unsubscribe('dashboard:admin').catch(() => {})
        subscriber.quit().catch(() => {})
      }
    })

    // System health — 15s: đủ nhanh phát hiện service down, không spam DB
    const health$ = timer(0, 15_000).pipe(
      switchMap(() =>
        from(this.adminService.getSystemHealth()).pipe(
          catchError(() => of(null))
        )
      ),
      filter((v): v is NonNullable<typeof v> => v !== null),
      map(data => emit('system_health', data))
    )

    // Queue stats — 10s: RabbitMQ nhẹ, queue depth thay đổi nhanh
    const queueStats$ = timer(0, 10_000).pipe(
      switchMap(() =>
        from(this.adminService.getQueueStats()).pipe(catchError(() => of(null)))
      ),
      filter((v): v is NonNullable<typeof v> => v !== null),
      map(data => emit('queue_stats', data))
    )

    // Admin KPIs — 20s: orders/revenue hôm nay, không cần sub-second
    const adminStats$ = timer(0, 20_000).pipe(
      switchMap(() =>
        from(this.adminService.getStats()).pipe(catchError(() => of(null)))
      ),
      filter((v): v is NonNullable<typeof v> => v !== null),
      map(data => emit('admin_stats', data))
    )

    // Heartbeat — giữ kết nối không bị timeout (nginx/proxy thường 60s)
    const heartbeat$ = timer(30_000, 30_000).pipe(
      map(() => emit('heartbeat', { ts: Date.now() }))
    )

    // DLQ KHÔNG push qua SSE: getDeadLetterJobs() fetch toàn bộ records chỉ để đếm
    // → để hook useDeadLetterJobs() polling 30s tự xử lý là đủ

    return merge(health$, queueStats$, adminStats$, heartbeat$, slaEvents$)
  }
}
