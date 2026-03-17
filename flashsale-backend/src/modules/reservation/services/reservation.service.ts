import { Injectable, Logger } from '@nestjs/common'
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
      expiredAt
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
      await this.redis.deleteReservation(reservationId)
    }

    // Remove from expiry sorted set
    await this.redis.removeReservationExpiry(reservationId)

    // Update DB record
    await this.reservationRepository.updateStatus(
      reservationId,
      ReservationStatus.EXPIRED,
      reason
    )
  }

  async markAsPaid(reservationId: string): Promise<void> {
    await this.redis.deleteReservation(reservationId)
    await this.redis.removeReservationExpiry(reservationId)
    await this.reservationRepository.markAsPaid(reservationId)
  }
}
