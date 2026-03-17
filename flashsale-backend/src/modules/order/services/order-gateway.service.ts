import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { CampaignStatus, OrderStatus, UserRole } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import { OrderRepository } from '../repositories/order.repository'
import * as crypto from 'crypto'

@Injectable()
export class OrderGatewayService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService
  ) {}

  async purchase(
    userId: string,
    dto: { campaignProductId: string; quantity: number },
    idempotencyKey: string
  ): Promise<{ requestId: string }> {
    // 1. Idempotency check — return cached result if already processed
    const cached = await this.redis.getIdempotencyKey(idempotencyKey)
    if (cached) return JSON.parse(cached) as { requestId: string }

    // 2. Validate campaign is ACTIVE
    const cp = await this.orderRepository.findCampaignProductWithCampaign(
      dto.campaignProductId
    )
    if (!cp) throw new BadRequestException('Sản phẩm không tồn tại')
    if (cp.campaign.status !== CampaignStatus.ACTIVE)
      throw new BadRequestException('Flash Sale chưa bắt đầu hoặc đã kết thúc')

    // 3. Check per-user limit
    const holdingCount = await this.orderRepository.countHoldingReservations(
      userId,
      dto.campaignProductId
    )
    if (holdingCount >= cp.perUserLimit) {
      throw new BadRequestException(
        `Bạn chỉ được mua tối đa ${cp.perUserLimit} sản phẩm`
      )
    }

    // 4. Route to priority queue based on whitelist
    const isWhitelisted = await this.redis.isWhitelisted(cp.campaignId, userId)
    const queue = isWhitelisted ? 'order.high' : 'order.normal'

    // 5. Generate requestId and enqueue
    const requestId = crypto.randomUUID()
    await this.rabbitmq.publish(queue, {
      requestId,
      userId,
      campaignProductId: dto.campaignProductId,
      quantity: dto.quantity,
      idempotencyKey,
      timestamp: Date.now()
    })

    // 6. Cache requestId so duplicate requests return same requestId (5 min TTL)
    const result = { requestId }
    await this.redis.setIdempotencyKey(
      idempotencyKey,
      JSON.stringify(result),
      300
    )

    return result
  }

  async getResult(requestId: string): Promise<object> {
    const result = await this.redis.getPurchaseResult(requestId)
    if (!result) return { status: 'PROCESSING' }
    return result
  }

  async getMyOrders(
    userId: string,
    role: string,
    query: { status?: OrderStatus; page?: number; limit?: number }
  ) {
    const filters = {
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 10
    }

    if (role === UserRole.MERCHANT) {
      return this.orderRepository.findAllForMerchant(userId, filters)
    }
    return this.orderRepository.findAllForCustomer(userId, filters)
  }

  async getOrderById(orderId: string, userId: string, role: string) {
    const order = await this.orderRepository.findById(orderId)
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại')

    if (role === UserRole.ADMIN) return order
    if (order.customerId === userId) return order

    if (role === UserRole.MERCHANT) {
      const merchant =
        await this.orderRepository.findMerchantByUserIdAndOrderMerchantId(
          userId,
          order.merchantId
        )
      if (merchant) return order
    }

    throw new ForbiddenException('Không có quyền truy cập đơn hàng này')
  }
}
