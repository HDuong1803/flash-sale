import { Injectable } from '@nestjs/common'
import { Order, OrderStatus, ReservationStatus } from '@prisma/client'
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
        status: ReservationStatus.HOLDING
      }
    })
  }

  async findHoldingReservation(
    userId: string,
    campaignProductId: string
  ): Promise<{ id: string; expiredAt: Date } | null> {
    return this.prisma.reservation.findFirst({
      where: {
        customerId: userId,
        campaignProductId,
        status: ReservationStatus.HOLDING,
        expiredAt: { gt: new Date() }
      },
      select: { id: true, expiredAt: true },
      orderBy: { expiredAt: 'desc' }
    })
  }

  async findById(id: string): Promise<Order | null> {
    const order = await this.prisma.order.findUnique({
      where: { id },
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
        payment: true,
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
      }
    })

    if (!order) return null

    return {
      ...order,
      campaignId: order.reservation.campaignProduct.campaignId,
      campaignName: order.reservation.campaignProduct.campaign.name,
      reservation: undefined,
      items: order.items.map(item => ({
        ...item,
        productName: item.product.name,
        imageUrl: item.product.images[0]?.photo.url ?? null,
        product: undefined
      }))
    } as unknown as Order
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
    filters: { status?: OrderStatus; page: number; limit: number }
  ): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
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
        payment: true,
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

    return orders.map(order => ({
      ...order,
      campaignId: order.reservation.campaignProduct.campaignId,
      campaignName: order.reservation.campaignProduct.campaign.name,
      reservation: undefined,
      items: order.items.map(item => ({
        ...item,
        productName: item.product.name,
        imageUrl: item.product.images[0]?.photo.url ?? null,
        product: undefined
      }))
    })) as unknown as Order[]
  }

  async findAllForMerchant(
    merchantUserId: string,
    filters: { status?: OrderStatus; page: number; limit: number }
  ): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        merchant: { userId: merchantUserId },
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
        payment: true,
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

    return orders.map(order => ({
      ...order,
      campaignId: order.reservation.campaignProduct.campaignId,
      campaignName: order.reservation.campaignProduct.campaign.name,
      reservation: undefined,
      items: order.items.map(item => ({
        ...item,
        productName: item.product.name,
        imageUrl: item.product.images[0]?.photo.url ?? null,
        product: undefined
      }))
    })) as unknown as Order[]
  }
}
