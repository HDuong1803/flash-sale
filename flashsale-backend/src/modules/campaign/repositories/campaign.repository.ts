import { Injectable } from '@nestjs/common'
import {
  Campaign,
  CampaignProduct,
  CampaignStatus,
  OrderStatus,
  PreRegistration
} from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

export type CampaignWithProducts = Campaign & {
  campaignProducts: Array<
    CampaignProduct & {
      product: { name: string; imageUrl: string | null; originalPrice: number }
    }
  >
  merchant: { businessName: string }
}

@Injectable()
export class CampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Campaign | null> {
    return this.prisma.campaign.findUnique({ where: { id } })
  }

  async findByIdWithProducts(id: string): Promise<CampaignWithProducts | null> {
    return this.prisma.campaign.findUnique({
      where: { id },
      include: {
        campaignProducts: {
          include: {
            product: {
              select: { name: true, imageUrl: true, originalPrice: true }
            }
          }
        },
        merchant: { select: { businessName: true } }
      }
    }) as unknown as Promise<CampaignWithProducts | null>
  }

  async findByIdAndMerchant(
    id: string,
    merchantId: string
  ): Promise<Campaign | null> {
    return this.prisma.campaign.findFirst({ where: { id, merchantId } })
  }

  async findByIdAndMerchantWithProducts(
    id: string,
    merchantId: string
  ): Promise<(Campaign & { campaignProducts: CampaignProduct[] }) | null> {
    return this.prisma.campaign.findFirst({
      where: { id, merchantId },
      include: { campaignProducts: true }
    })
  }

  async findAll(filters: {
    status?: CampaignStatus
    statuses?: CampaignStatus[]
    search?: string
    merchantId?: string
    page: number
    limit: number
  }): Promise<CampaignWithProducts[]> {
    return this.prisma.campaign.findMany({
      where: {
        ...(filters.statuses
          ? { status: { in: filters.statuses } }
          : filters.status
          ? { status: filters.status }
          : {}),
        ...(filters.merchantId ? { merchantId: filters.merchantId } : {}),
        ...(filters.search
          ? { name: { contains: filters.search, mode: 'insensitive' as const } }
          : {})
      },
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
      orderBy: { startTime: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit
    }) as unknown as Promise<CampaignWithProducts[]>
  }

  async create(data: {
    merchantId: string
    name: string
    description?: string
    startTime: Date
    endTime: Date
  }): Promise<Campaign> {
    return this.prisma.campaign.create({ data })
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      description: string
      startTime: Date
      endTime: Date
    }>
  ): Promise<Campaign> {
    return this.prisma.campaign.update({ where: { id }, data })
  }

  async updateStatus(id: string, status: CampaignStatus): Promise<Campaign> {
    return this.prisma.campaign.update({ where: { id }, data: { status } })
  }

  async addProduct(data: {
    campaignId: string
    productId: string
    salePrice: number
    saleQuantity: number
    perUserLimit: number
  }): Promise<CampaignProduct> {
    return this.prisma.campaignProduct.create({
      data: {
        campaignId: data.campaignId,
        productId: data.productId,
        salePrice: data.salePrice,
        saleQuantity: data.saleQuantity,
        perUserLimit: data.perUserLimit,
        remainingQuantity: data.saleQuantity
      }
    })
  }

  async removeProduct(campaignId: string, productId: string): Promise<void> {
    await this.prisma.campaignProduct.delete({
      where: { campaignId_productId: { campaignId, productId } }
    })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.campaign.delete({ where: { id } })
  }

  async upsertPreRegistration(
    customerId: string,
    campaignId: string
  ): Promise<PreRegistration> {
    return this.prisma.preRegistration.upsert({
      where: { customerId_campaignId: { customerId, campaignId } },
      create: { customerId, campaignId },
      update: {}
    })
  }

  async getReport(campaignId: string): Promise<{
    totalOrders: number
    cancelledOrders: number
    totalRevenue: number
    totalReservations: number
  }> {
    const [totalOrders, cancelledOrders, revenueResult, totalReservations] =
      await Promise.all([
        this.prisma.order.count({
          where: { reservation: { campaignProduct: { campaignId } } }
        }),
        this.prisma.order.count({
          where: {
            status: OrderStatus.CANCELLED,
            reservation: { campaignProduct: { campaignId } }
          }
        }),
        this.prisma.order.aggregate({
          where: {
            status: { not: OrderStatus.CANCELLED },
            reservation: { campaignProduct: { campaignId } }
          },
          _sum: { totalAmount: true }
        }),
        this.prisma.reservation.count({
          where: { campaignProduct: { campaignId } }
        })
      ])

    return {
      totalOrders,
      cancelledOrders,
      totalRevenue: Number(revenueResult._sum.totalAmount ?? 0),
      totalReservations
    }
  }
}
