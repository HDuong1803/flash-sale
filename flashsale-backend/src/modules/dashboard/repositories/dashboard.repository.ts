import { Injectable } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCampaignProducts(
    campaignId: string
  ): Promise<
    Array<{ id: string; saleQuantity: number; remainingQuantity: number }>
  > {
    return this.prisma.campaignProduct.findMany({
      where: { campaignId },
      select: { id: true, saleQuantity: true, remainingQuantity: true }
    })
  }

  async countOrdersForCampaign(campaignId: string): Promise<number> {
    return this.prisma.order.count({
      where: { reservation: { campaignProduct: { campaignId } } }
    })
  }

  async countSuccessfulOrdersForCampaign(campaignId: string): Promise<number> {
    return this.prisma.order.count({
      where: {
        reservation: { campaignProduct: { campaignId } },
        status: { not: OrderStatus.CANCELLED }
      }
    })
  }

  async getCampaignRealtimeKpis(campaignId: string): Promise<{
    totalOrders: number
    successOrders: number
    totalReservations: number
    totalRevenue: number
    conversionRate: number
    queueDepth: number
  }> {
    const [totalOrders, cancelledOrders, totalReservations, revenueResult] =
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
        this.prisma.reservation.count({
          where: { campaignProduct: { campaignId } }
        }),
        this.prisma.order.aggregate({
          where: {
            status: { not: OrderStatus.CANCELLED },
            reservation: { campaignProduct: { campaignId } }
          },
          _sum: { totalAmount: true }
        })
      ])

    const successOrders = Math.max(totalOrders - cancelledOrders, 0)
    const conversionRate =
      totalReservations > 0 ? (successOrders / totalReservations) * 100 : 0
    const queueDepth = Math.max(totalReservations - totalOrders, 0)

    return {
      totalOrders,
      successOrders,
      totalReservations,
      totalRevenue: Number(revenueResult._sum.totalAmount ?? 0),
      conversionRate,
      queueDepth
    }
  }
}
