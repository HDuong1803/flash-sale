import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Sse,
  UseGuards
} from '@nestjs/common'
import { Observable, Subscriber } from 'rxjs'
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
  private readonly channelSubscribers = new Map<
    string,
    {
      redisClient: any
      clients: Set<Subscriber<MessageEvent>>
    }
  >()

  constructor(
    private readonly redis: RedisService,
    private readonly dashboardRepository: DashboardRepository
  ) {}

  @ApiOperation({
    summary: 'Luồng sự kiện dashboard thời gian thực cho chiến dịch (SSE)'
  })
  @ApiParam({ name: 'campaignId', description: 'ID chiến dịch' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Luồng SSE: STOCK_UPDATE, ORDER_CONFIRMED, heartbeat'
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
      const channel = `dashboard:${campaignId}`

      // Get or create channel subscription
      let subState = this.channelSubscribers.get(channel)
      if (!subState) {
        const redisClient = this.redis.client.duplicate()
        subState = {
          redisClient,
          clients: new Set<Subscriber<MessageEvent>>()
        }

        redisClient.subscribe(channel, err => {
          if (err) {
            subState!.clients.forEach(c => c.error(err))
            return
          }
        })

        redisClient.on('message', (_ch: string, message: string) => {
          subState!.clients.forEach(c =>
            c.next({ data: message } as MessageEvent)
          )
        })

        this.channelSubscribers.set(channel, subState)
      }

      // Add observer directly to Set
      subState.clients.add(observer as Subscriber<MessageEvent>)

      const heartbeatTimer = setInterval(() => {
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
        const state = this.channelSubscribers.get(channel)
        if (state) {
          state.clients.delete(observer as Subscriber<MessageEvent>)
          if (state.clients.size === 0) {
            state.redisClient.unsubscribe(channel).catch(() => {})
            state.redisClient.quit().catch(() => {})
            this.channelSubscribers.delete(channel)
          }
        }
      }
    })
  }

  private async getInitialSnapshot(campaignId: string): Promise<object | null> {
    try {
      const products = await this.dashboardRepository.getCampaignProducts(
        campaignId
      )

      // Batch fetch: 1 Redis MGET thay vì N individual GETs (tránh SSE amplification)
      const ids = products.map(p => p.id)
      const stocks = await this.redis.mgetStocks(ids)
      const stockValues = products.map((p, i) => ({
        id: p.id,
        remaining: stocks[i] ?? p.remainingQuantity,
        total: p.saleQuantity
      }))

      const totalOrders = await this.dashboardRepository.countOrdersForCampaign(
        campaignId
      )

      return { stockValues, totalOrders }
    } catch {
      return null
    }
  }
}
