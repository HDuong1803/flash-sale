import { Injectable } from '@nestjs/common'
import { Order, OrderStatus } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCampaignProductWithCampaign(campaignProductId: string) {
    return this.prisma.campaignProduct.findUnique({
      where: { id: campaignProductId },
      include: { campaign: true }
    })
  }

  async countHoldingReservations(
    userId: string,
    campaignProductId: string
  ): Promise<number> {
    return this.prisma.reservation.count({
      where: {
        customerId: userId,
        campaignProductId,
        status: 'HOLDING'
      }
    })
  }

  async findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        payment: true,
        reservation: true
      }
    }) as unknown as Order | null
  }

  async findMerchantByUserIdAndOrderMerchantId(
    userId: string,
    merchantId: string
  ) {
    return this.prisma.merchantProfile.findFirst({
      where: { userId, id: merchantId }
    })
  }

  async findAllForCustomer(
    customerId: string,
    filters: { status?: string; page: number; limit: number }
  ): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        customerId,
        ...(filters.status ? { status: filters.status as OrderStatus } : {})
      },
      include: { items: { include: { product: true } }, payment: true },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit
    }) as unknown as Order[]
  }

  async findAllForMerchant(
    merchantUserId: string,
    filters: { status?: string; page: number; limit: number }
  ): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        merchant: { userId: merchantUserId },
        ...(filters.status ? { status: filters.status as OrderStatus } : {})
      },
      include: { items: { include: { product: true } }, payment: true },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit
    }) as unknown as Order[]
  }
}
