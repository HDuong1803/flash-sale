import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { ReservationStatus } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { ReservationRepository } from '../repositories/reservation.repository'

@Injectable()
export class ReservationService {
  private readonly logger = new Logger(ReservationService.name)

  constructor(
    private readonly reservationRepository: ReservationRepository,
    private readonly redis: RedisService
  ) {}

  async createReservation(data: {
    id: string
    customerId: string
    campaignProductId: string
    quantity: number
    idempotencyKey: string
  }): Promise<void> {
    const TTL = 600 // 10 minutes
    const expiredAt = new Date(Date.now() + TTL * 1000)

    // Step 1: Write to Redis (source of truth for speed)
    await this.redis.setReservation(
      data.id,
      {
        customerId: data.customerId,
        campaignProductId: data.campaignProductId,
        quantity: String(data.quantity),
        status: ReservationStatus.HOLDING,
        expiredAt: expiredAt.toISOString()
      },
      TTL
    )

    // Step 2: Register in expiry sorted set (for scheduler cleanup)
    await this.redis.addReservationExpiry(data.id, expiredAt.getTime())

    // Step 3: Write to DB (persistent record)
    await this.reservationRepository.create({
      id: data.id,
      customerId: data.customerId,
      campaignProductId: data.campaignProductId,
      quantity: data.quantity,
      expiredAt,
      idempotencyKey: data.idempotencyKey
    })
  }

  async releaseReservation(
    reservationId: string,
    reason: string
  ): Promise<void> {
    const resv = await this.redis.getReservation(reservationId)

    if (resv) {
      // Restore stock atomically in Redis
      await this.redis.incrementStock(
        resv.campaignProductId,
        parseInt(resv.quantity)
      )
      // Restore per-user purchase counter so user can retry
      await this.redis.decrementPurchaseCount(
        resv.campaignProductId,
        resv.customerId,
        parseInt(resv.quantity)
      )
      await this.redis.deleteReservation(reservationId)
    } else {
      // Redis key đã mất (evicted/expired) — fallback từ DB để restore stock
      const dbResv =
        await this.reservationRepository.findWithCampaignProductById(
          reservationId
        )
      if (dbResv && dbResv.status === ReservationStatus.HOLDING) {
        await this.redis.incrementStock(
          dbResv.campaignProduct.id,
          dbResv.quantity
        )
        await this.redis.decrementPurchaseCount(
          dbResv.campaignProduct.id,
          dbResv.customerId,
          dbResv.quantity
        )
        this.logger.warn({
          event: 'reservation_redis_fallback',
          reservationId,
          reason: 'Redis key missing — restored stock from DB'
        })
      }
    }

    // Remove from expiry sorted set
    await this.redis.removeReservationExpiry(reservationId)

    // Update DB record
    await this.reservationRepository.updateStatus(
      reservationId,
      ReservationStatus.EXPIRED,
      reason
    )

    if (reason.toUpperCase().includes('EXPIRE')) {
      await this.redis.incrementMetricCounter('reservation_expire_rate')
    }
  }

  /** release toàn bộ HOLDING reservations khi force stop campaign */
  async releaseAllHoldingForCampaign(
    campaignProductIds: string[]
  ): Promise<void> {
    if (!campaignProductIds.length) return

    const holdings =
      await this.reservationRepository.findHoldingByCampaignProductIds(
        campaignProductIds
      )

    await Promise.allSettled(
      holdings.map(r => this.releaseReservation(r.id, 'CAMPAIGN_FORCE_STOPPED'))
    )

    if (holdings.length > 0) {
      this.logger.log(
        `Released ${holdings.length} HOLDING reservations for force-stopped campaign`
      )
    }
  }

  async markAsPaid(reservationId: string): Promise<void> {
    await this.redis.deleteReservation(reservationId)
    await this.redis.removeReservationExpiry(reservationId)
    await this.reservationRepository.markAsPaid(reservationId)
  }

  async cancelReservation(
    reservationId: string,
    customerId: string
  ): Promise<void> {
    const reservation =
      await this.reservationRepository.findWithCampaignProductById(
        reservationId
      )

    if (!reservation) {
      throw new NotFoundException('Không tìm thấy giữ chỗ')
    }
    if (reservation.customerId !== customerId) {
      throw new NotFoundException('Không tìm thấy giữ chỗ')
    }
    if (reservation.status !== 'HOLDING') {
      throw new BadRequestException(
        'Chỉ có thể huỷ giữ chỗ đang ở trạng thái HOLDING'
      )
    }

    await this.releaseReservation(reservationId, 'USER_CANCELLED')
  }

  async getActiveForCustomer(customerId: string) {
    return this.reservationRepository.findActiveByCustomerId(customerId)
  }

  async getDetailForCustomer(reservationId: string, customerId: string) {
    const reservation =
      await this.reservationRepository.findDetailByIdForCustomer(
        reservationId,
        customerId
      )

    if (!reservation) {
      throw new NotFoundException('Không tìm thấy giữ chỗ')
    }

    const salePrice = Number(reservation.campaignProduct.salePrice)
    return {
      id: reservation.id,
      status: reservation.status,
      quantity: reservation.quantity,
      expiredAt: reservation.expiredAt,
      shippingAddress: reservation.shippingAddress,
      totalAmount: salePrice * reservation.quantity,
      campaignProduct: {
        salePrice,
        product: {
          name: reservation.campaignProduct.product.name,
          imageUrl:
            reservation.campaignProduct.product.images[0]?.photo.url ?? null
        }
      }
    }
  }
}
