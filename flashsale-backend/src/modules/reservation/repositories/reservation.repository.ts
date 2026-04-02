import { Injectable, Logger } from '@nestjs/common'
import { Prisma, Reservation, ReservationStatus } from '@prisma/client'
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
    idempotencyKey: string
  }): Promise<Reservation> {
    return this.prisma.reservation.create({
      data: {
        id: data.id,
        customerId: data.customerId,
        campaignProductId: data.campaignProductId,
        quantity: data.quantity,
        status: ReservationStatus.HOLDING,
        expiredAt: data.expiredAt,
        idempotencyKey: data.idempotencyKey
      } satisfies Prisma.ReservationUncheckedCreateInput
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

  async findDetailByIdForCustomer(reservationId: string, customerId: string) {
    return this.prisma.reservation.findFirst({
      where: { id: reservationId, customerId },
      select: {
        id: true,
        status: true,
        quantity: true,
        expiredAt: true,
        shippingAddress: true,
        campaignProduct: {
          select: {
            salePrice: true,
            product: {
              select: {
                name: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { photo: { select: { url: true } } }
                }
              }
            }
          }
        }
      }
    })
  }
}
