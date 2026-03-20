import { Injectable } from '@nestjs/common'
import {
  CampaignStatus,
  KycStatus,
  MerchantProfile,
  OrderStatus
} from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class MerchantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<MerchantProfile | null> {
    return this.prisma.merchantProfile.findUnique({
      where: { userId },
      include: { user: { select: { email: true, fullName: true } } }
    })
  }

  async findMyCampaigns(userId: string) {
    return this.prisma.campaign.findMany({
      where: { merchant: { userId } },
      include: {
        campaignProducts: {
          include: {
            product: {
              select: { name: true, imageUrl: true, originalPrice: true }
            }
          }
        },
        merchant: { select: { businessName: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async findById(id: string): Promise<MerchantProfile | null> {
    return this.prisma.merchantProfile.findUnique({ where: { id } })
  }

  async findByTaxCode(taxCode: string): Promise<MerchantProfile | null> {
    return this.prisma.merchantProfile.findUnique({ where: { taxCode } })
  }

  async create(data: {
    userId: string
    businessName: string
    taxCode: string
    description?: string
    phone: string
    address: string
  }): Promise<MerchantProfile> {
    return this.prisma.merchantProfile.create({ data })
  }

  async updateKycStatus(
    id: string,
    status: KycStatus,
    extra?: { rejectionReason?: string; approvedAt?: Date; approvedBy?: string }
  ): Promise<MerchantProfile> {
    return this.prisma.merchantProfile.update({
      where: { id },
      data: { kycStatus: status, ...extra }
    })
  }

  async getStats(merchantId: string) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      revenueResult,
      activeCampaigns,
      ordersToday,
      reservations,
      successOrders
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          merchantId,
          createdAt: { gte: todayStart },
          status: { not: OrderStatus.CANCELLED }
        },
        _sum: { totalAmount: true }
      }),
      this.prisma.campaign.count({
        where: { merchantId, status: CampaignStatus.ACTIVE }
      }),
      this.prisma.order.count({
        where: { merchantId, createdAt: { gte: todayStart } }
      }),
      this.prisma.reservation.count({
        where: {
          campaignProduct: { campaign: { merchantId } },
          createdAt: { gte: todayStart }
        }
      }),
      this.prisma.order.count({
        where: {
          merchantId,
          createdAt: { gte: todayStart },
          status: { not: OrderStatus.CANCELLED }
        }
      })
    ])

    return {
      revenueToday: Number(revenueResult._sum.totalAmount ?? 0),
      activeCampaigns,
      ordersToday,
      conversionRate:
        reservations > 0
          ? Math.round((successOrders / reservations) * 100 * 10) / 10
          : 0
    }
  }

  async getOrders(
    merchantId: string,
    filters: { status?: OrderStatus; page: number; limit: number }
  ) {
    return this.prisma.order.findMany({
      where: {
        merchantId,
        ...(filters.status ? { status: filters.status } : {})
      },
      include: {
        items: {
          include: { product: { select: { name: true, imageUrl: true } } }
        },
        payment: { select: { status: true, method: true, paidAt: true } },
        customer: { select: { fullName: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit
    })
  }
}
