import { Injectable, Logger } from '@nestjs/common'
import { Reservation, ReservationStatus } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class ReservationRepository {
  private readonly logger = new Logger(ReservationRepository.name)

  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    id: string
    customerId: string
    campaignProductId: string
    quantity: number
    expiredAt: Date
  }): Promise<Reservation> {
    return this.prisma.reservation.create({
      data: {
        id: data.id,
        customerId: data.customerId,
        campaignProductId: data.campaignProductId,
        quantity: data.quantity,
        status: ReservationStatus.HOLDING,
        expiredAt: data.expiredAt
      }
    })
  }

  async updateStatus(
    id: string,
    status: ReservationStatus,
    statusReason?: string
  ): Promise<Reservation | null> {
    try {
      return await this.prisma.reservation.update({
        where: { id },
        data: {
          status,
          ...(statusReason ? { statusReason } : {})
        }
      })
    } catch {
      // Reservation might not exist in DB yet if creation was in-flight
      this.logger.warn(`Reservation ${id} not found in DB during status update`)
      return null
    }
  }

  async markAsPaid(id: string): Promise<void> {
    await this.prisma.reservation.update({
      where: { id },
      data: { status: ReservationStatus.PAID }
    })
  }

  async findCampaignProductById(campaignProductId: string) {
    return this.prisma.campaignProduct.findUnique({
      where: { id: campaignProductId },
      select: { campaignId: true, saleQuantity: true }
    })
  }
}
