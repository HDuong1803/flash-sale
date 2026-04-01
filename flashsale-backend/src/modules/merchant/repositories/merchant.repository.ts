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
    const raws = await this.prisma.campaign.findMany({
      where: { merchant: { userId } },
      include: {
        campaignProducts: {
          include: {
            product: {
              select: {
                name: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { photo: { select: { url: true } } }
                },
                originalPrice: true
              }
            }
          }
        },
        merchant: { select: { businessName: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    return raws.map(c => ({
      ...c,
      campaignProducts: c.campaignProducts.map(cp => ({
        ...cp,
        product: {
          name: cp.product.name,
          originalPrice: cp.product.originalPrice,
          imageUrl: cp.product.images[0]?.photo.url ?? null
        }
      }))
    }))
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

  async getRevenue(
    merchantId: string,
    startDate: Date,
    endDate: Date,
    prevStartDate: Date
  ) {
    const dateRange = { gte: startDate, lte: endDate }
    const [
      currentRevResult,
      prevRevResult,
      totalRevResult,
      successOrders,
      cancelledOrders,
      totalOrders,
      dailyOrdersRaw,
      ordersWithCampaignRaw,
      orderItemsRaw
    ] = await Promise.all([
      // Revenue kỳ này
      this.prisma.order.aggregate({
        where: {
          merchantId,
          createdAt: dateRange,
          status: { not: OrderStatus.CANCELLED }
        },
        _sum: { totalAmount: true }
      }),
      // Revenue kỳ trước (cùng độ dài)
      this.prisma.order.aggregate({
        where: {
          merchantId,
          createdAt: { gte: prevStartDate, lt: startDate },
          status: { not: OrderStatus.CANCELLED }
        },
        _sum: { totalAmount: true }
      }),
      // Revenue toàn thời gian
      this.prisma.order.aggregate({
        where: { merchantId, status: { not: OrderStatus.CANCELLED } },
        _sum: { totalAmount: true }
      }),
      // Đơn hoàn thành trong kỳ
      this.prisma.order.count({
        where: { merchantId, createdAt: dateRange, status: OrderStatus.DONE }
      }),
      // Đơn huỷ trong kỳ
      this.prisma.order.count({
        where: {
          merchantId,
          createdAt: dateRange,
          status: OrderStatus.CANCELLED
        }
      }),
      // Tổng đơn trong kỳ
      this.prisma.order.count({
        where: { merchantId, createdAt: dateRange }
      }),
      // Dữ liệu thô để vẽ chart theo ngày
      this.prisma.order.findMany({
        where: {
          merchantId,
          createdAt: dateRange,
          status: { not: OrderStatus.CANCELLED }
        },
        select: { createdAt: true, totalAmount: true }
      }),
      // Dữ liệu để group theo chiến dịch
      this.prisma.order.findMany({
        where: {
          merchantId,
          createdAt: dateRange,
          status: { not: OrderStatus.CANCELLED }
        },
        select: {
          totalAmount: true,
          reservation: {
            select: {
              campaignProduct: {
                select: {
                  campaign: { select: { id: true, name: true, status: true } }
                }
              }
            }
          }
        }
      }),
      // Order items để tính top sản phẩm
      this.prisma.orderItem.findMany({
        where: {
          order: {
            merchantId,
            createdAt: dateRange,
            status: { not: OrderStatus.CANCELLED }
          }
        },
        select: {
          productId: true,
          quantity: true,
          unitPrice: true,
          product: { select: { name: true } }
        }
      })
    ])

    return {
      revenueCurrent: Number(currentRevResult._sum.totalAmount ?? 0),
      revenuePrevious: Number(prevRevResult._sum.totalAmount ?? 0),
      totalRevenue: Number(totalRevResult._sum.totalAmount ?? 0),
      successOrders,
      cancelledOrders,
      totalOrders,
      dailyOrders: dailyOrdersRaw,
      ordersWithCampaign: ordersWithCampaignRaw,
      orderItems: orderItemsRaw
    }
  }

  async getOrders(
    merchantId: string,
    filters: { status?: OrderStatus; page: number; limit: number }
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        merchantId,
        ...(filters.status ? { status: filters.status } : {})
      },
      include: {
        items: {
          include: {
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
        },
        payment: { select: { status: true, method: true, paidAt: true } },
        customer: { select: { fullName: true } },
        reservation: {
          select: {
            campaignProduct: {
              select: {
                campaignId: true,
                campaign: { select: { name: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit
    })
    return orders.map(o => ({
      ...o,
      campaignId: o.reservation.campaignProduct.campaignId,
      campaignName: o.reservation.campaignProduct.campaign.name,
      reservation: undefined,
      items: o.items.map(item => ({
        ...item,
        productName: item.product.name,
        imageUrl: item.product.images[0]?.photo.url ?? null,
        product: undefined
      }))
    }))
  }
}
