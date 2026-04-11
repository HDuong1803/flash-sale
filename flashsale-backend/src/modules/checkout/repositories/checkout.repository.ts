import { Injectable } from '@nestjs/common'
import {
  CampaignStatus,
  Payment,
  PaymentMethod,
  PaymentStatus
} from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class CheckoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCampaignProduct(campaignProductId: string) {
    return this.prisma.campaignProduct.findUnique({
      where: { id: campaignProductId },
      select: {
        salePrice: true,
        campaignId: true,
        campaign: {
          select: {
            status: true,
            commissionRate: true,
            merchant: {
              select: {
                stripeAccountId: true,
                stripeAccountStatus: true,
                stripeChargesEnabled: true
              }
            }
          }
        }
      }
    })
  }

  async isCampaignActive(campaignId: string): Promise<boolean> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true }
    })
    return campaign?.status === CampaignStatus.ACTIVE
  }

  async findPaymentByIdempotencyKey(
    idempotencyKey: string
  ): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { idempotencyKey } })
  }

  async createOrReusePaymentWithReservationUpdate(data: {
    reservationId: string
    amount: number
    method: PaymentMethod
    idempotencyKey: string
    shippingAddress: string
  }): Promise<Payment> {
    return this.prisma.$transaction(async tx => {
      await tx.reservation.update({
        where: { id: data.reservationId },
        data: { shippingAddress: data.shippingAddress }
      })

      const existingPayment = await tx.payment.findUnique({
        where: { idempotencyKey: data.idempotencyKey }
      })
      if (existingPayment) return existingPayment

      return tx.payment.create({
        data: {
          reservationId: data.reservationId,
          amount: data.amount,
          method: data.method,
          status: PaymentStatus.PENDING,
          idempotencyKey: data.idempotencyKey
        }
      })
    })
  }

  async createPayment(data: {
    reservationId: string
    amount: number
    method: PaymentMethod
    idempotencyKey: string
  }): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        reservationId: data.reservationId,
        amount: data.amount,
        method: data.method,
        status: PaymentStatus.PENDING,
        idempotencyKey: data.idempotencyKey
      }
    })
  }
}
