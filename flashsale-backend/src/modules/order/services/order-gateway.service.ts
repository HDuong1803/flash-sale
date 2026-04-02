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
    const cachedRequestId = await this.redis.getPurchaseRequestIdempotency(
      idempotencyKey
    )
    if (cachedRequestId) return { requestId: cachedRequestId }

    // 2. Validate campaign is ACTIVE
    const cp = await this.orderRepository.findCampaignProductWithCampaign(
      dto.campaignProductId
    )
    if (!cp) throw new BadRequestException('Sản phẩm không tồn tại')
    if (cp.campaign.status !== CampaignStatus.ACTIVE)
      throw new BadRequestException('Flash Sale chưa bắt đầu hoặc đã kết thúc')

    // 3. Check per-user limit — atomic Redis INCR to prevent race condition
    // Dùng Lua script: check + increment trong một lệnh Redis duy nhất,
    // tránh trường hợp nhiều request song song vượt qua cùng lúc (TOCTOU).
    // TTL = thời gian còn lại của campaign hoặc 24h nếu không tính được.
    const campaignEndTime = cp.campaign.endTime
    const ttlSeconds = campaignEndTime
      ? Math.max(Math.ceil((campaignEndTime.getTime() - Date.now()) / 1000), 60)
      : 86400
    const newCount = await this.redis.incrementPurchaseCount(
      dto.campaignProductId,
      userId,
      cp.perUserLimit,
      ttlSeconds
    )
    if (newCount === -1) {
      throw new BadRequestException(
        `Bạn chỉ được mua tối đa ${cp.perUserLimit} sản phẩm`
      )
    }

    // 4. Route to priority queue based on whitelist
    const isWhitelisted = await this.redis.isWhitelisted(cp.campaignId, userId)
    const queue = isWhitelisted ? 'order.high' : 'order.normal'

    // 5. Generate requestId and enqueue
    const requestId = crypto.randomUUID()
    const published = await this.rabbitmq.publish(queue, {
      requestId,
      userId,
      campaignProductId: dto.campaignProductId,
      quantity: dto.quantity,
      idempotencyKey,
      timestamp: Date.now()
    })

    if (!published) {
      // Rollback the counter increment so user can retry
      await this.redis.decrementPurchaseCount(dto.campaignProductId, userId)
      throw new BadRequestException(
        'Hệ thống đang quá tải, vui lòng thử lại sau'
      )
    }

    // 6. Cache requestId so duplicate requests return same requestId (5 min TTL)
    const result = { requestId }
    await this.redis.setPurchaseRequestIdempotency(
      idempotencyKey,
      requestId,
      300
    )
    await this.redis.setPurchaseRequestOwner(requestId, userId, 86400)

    return result
  }

  async getResult(
    requestId: string,
    requestingUserId: string
  ): Promise<object> {
    const ownerUserId = await this.redis.getPurchaseRequestOwner(requestId)
    if (ownerUserId && ownerUserId !== requestingUserId) {
      throw new ForbiddenException(
        'Không có quyền truy cập yêu cầu mua hàng này'
      )
    }

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
