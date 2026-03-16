import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Sse,
  UseGuards
} from '@nestjs/common'
import { Observable } from 'rxjs'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { RedisService } from '@infrastructure/redis/redis.service'
import { DashboardRepository } from '../repositories/dashboard.repository'

const moduleName = 'dashboard'

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('MERCHANT', 'ADMIN')
@ApiBearerAuth('JWT-auth')
export class DashboardController {
  constructor(
    private readonly redis: RedisService,
    private readonly dashboardRepository: DashboardRepository
  ) {}

  @ApiOperation({
    summary: 'Stream realtime dashboard events cho chiến dịch (SSE)'
  })
  @ApiParam({ name: 'campaignId', description: 'Campaign ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'SSE stream: STOCK_UPDATE, ORDER_CONFIRMED, heartbeat'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Chỉ MERCHANT hoặc ADMIN'
  })
  @Get(':campaignId/stream')
  @Sse()
  stream(@Param('campaignId') campaignId: string): Observable<MessageEvent> {
    return new Observable(observer => {
      const subscriber = this.redis.client.duplicate()
      let heartbeatTimer: NodeJS.Timeout

      subscriber.subscribe(`dashboard:${campaignId}`, err => {
        if (err) {
          observer.error(err)
          return
        }
      })

      subscriber.on('message', (_channel: string, message: string) => {
        observer.next({ data: message } as MessageEvent)
      })

      // Heartbeat every 30s to keep SSE connection alive
      heartbeatTimer = setInterval(() => {
        observer.next({
          data: JSON.stringify({ type: 'heartbeat' })
        } as MessageEvent)
      }, 30_000)

      // Send initial snapshot when client connects
      void this.getInitialSnapshot(campaignId).then(snapshot => {
        if (snapshot) {
          observer.next({
            data: JSON.stringify({ type: 'SNAPSHOT', ...snapshot })
          } as MessageEvent)
        }
      })

      // Cleanup when client disconnects
      return () => {
        clearInterval(heartbeatTimer)
        subscriber.unsubscribe()
        subscriber.quit()
      }
    })
  }

  private async getInitialSnapshot(campaignId: string): Promise<object | null> {
    try {
      const products = await this.dashboardRepository.getCampaignProducts(
        campaignId
      )

      const stockValues = await Promise.all(
        products.map(async p => {
          const remaining = await this.redis.getStock(p.id)
          return { id: p.id, remaining: remaining ?? 0, total: p.saleQuantity }
        })
      )

      const totalOrders = await this.dashboardRepository.countOrdersForCampaign(
        campaignId
      )

      return { stockValues, totalOrders }
    } catch {
      return null
    }
  }
}
