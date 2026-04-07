import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as amqplib from 'amqplib'
import * as crypto from 'crypto'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import { RedisService } from '@infrastructure/redis/redis.service'
import { ReservationService } from '@modules/reservation/services/reservation.service'
import { ReservationRepository } from '@modules/reservation/repositories/reservation.repository'

interface OrderJob {
  requestId: string
  userId: string
  campaignProductId: string
  quantity: number
  idempotencyKey: string
  timestamp: number
}

@Injectable()
export class OrderWorker implements OnModuleInit {
  private readonly logger = new Logger(OrderWorker.name)

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly redis: RedisService,
    private readonly reservationService: ReservationService,
    private readonly reservationRepository: ReservationRepository
  ) {}

  async onModuleInit(): Promise<void> {
    // HIGH priority queue processed with more consumers
    await this.rabbitmq.consume('order.high', msg => this.processOrder(msg))
    await this.rabbitmq.consume('order.normal', msg => this.processOrder(msg))
    this.logger.log(
      'Order Worker started — consuming order.high and order.normal'
    )
  }

  private async processOrder(msg: amqplib.ConsumeMessage): Promise<void> {
    const job: OrderJob = JSON.parse(msg.content.toString())
    const { requestId, userId, campaignProductId, quantity, idempotencyKey } =
      job

    this.logger.debug(
      `Processing order: requestId=${requestId}, user=${userId}`
    )

    // Atomic stock decrement via Lua script (no race condition)
    const remaining = await this.redis.decrementStock(
      campaignProductId,
      quantity
    )

    if (remaining === -2) {
      // Stock key not found — campaign may not be initialised yet
      // decrement purchase counter vì reservation không được tạo
      await this.redis.decrementPurchaseCount(campaignProductId, userId)
      const result = { status: 'SOLD_OUT', reason: 'Chiến dịch chưa bắt đầu' }
      await this.saveResult(requestId, idempotencyKey, result)
      return
    }

    if (remaining < 0) {
      // Insufficient stock
      // decrement purchase counter vì reservation không được tạo
      await this.redis.decrementPurchaseCount(campaignProductId, userId)
      const result = { status: 'SOLD_OUT', reason: 'Sản phẩm đã hết hàng' }
      await this.saveResult(requestId, idempotencyKey, result)
      this.logger.log(`SOLD_OUT: campaignProductId=${campaignProductId}`)
      return
    }

    // Stock reserved successfully — create reservation
    const reservationId = crypto.randomUUID()

    try {
      await this.reservationService.createReservation({
        id: reservationId,
        customerId: userId,
        campaignProductId,
        quantity,
        idempotencyKey
      })

      const expiredAt = new Date(Date.now() + 10 * 60 * 1000)
      const result = {
        status: 'RESERVED',
        reservationId,
        expiredAt: expiredAt.toISOString()
      }
      await this.saveResult(requestId, idempotencyKey, result)

      // Publish realtime event to SSE dashboard
      await this.publishDashboardUpdate(campaignProductId, remaining)

      this.logger.log(
        `RESERVED: reservationId=${reservationId}, remaining=${remaining}`
      )
    } catch (err: unknown) {
      // If reservation creation fails, roll back the stock decrement
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      this.logger.error(
        `Failed to create reservation for requestId=${requestId}: ${message}`
      )
      await this.redis.incrementStock(campaignProductId, quantity)

      const result = {
        status: 'SOLD_OUT',
        reason: 'Lỗi hệ thống, vui lòng thử lại'
      }
      await this.saveResult(requestId, idempotencyKey, result)
      throw err // let RabbitMQ nack and retry
    }
  }

  private async saveResult(
    requestId: string,
    idempotencyKey: string,
    result: object
  ): Promise<void> {
    await this.redis.setPurchaseResult(requestId, result)
    await this.redis.setPurchaseFinalResultByIdempotency(idempotencyKey, result)
  }

  private async publishDashboardUpdate(
    campaignProductId: string,
    stockRemaining: number
  ): Promise<void> {
    const cp = await this.reservationRepository.findCampaignProductById(
      campaignProductId
    )
    if (!cp) return

    await this.redis.publishDashboardEvent(cp.campaignId, {
      type: 'STOCK_UPDATE',
      stockRemaining,
      stockTotal: cp.saleQuantity,
      timestamp: new Date().toISOString()
    })
  }
}
