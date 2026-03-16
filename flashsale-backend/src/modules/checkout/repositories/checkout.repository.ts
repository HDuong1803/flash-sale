import { Injectable } from '@nestjs/common'
import { Payment } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class CheckoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCampaignProduct(campaignProductId: string) {
    return this.prisma.campaignProduct.findUnique({
      where: { id: campaignProductId },
      select: { salePrice: true, campaignId: true }
    })
  }

  async findPaymentByIdempotencyKey(
    idempotencyKey: string
  ): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { idempotencyKey } })
  }

  async createPayment(data: {
    reservationId: string
    amount: number
    method: string
    idempotencyKey: string
  }): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        reservationId: data.reservationId,
        amount: data.amount,
        method: data.method as any,
        status: 'PENDING',
        idempotencyKey: data.idempotencyKey
      }
    })
  }
}
