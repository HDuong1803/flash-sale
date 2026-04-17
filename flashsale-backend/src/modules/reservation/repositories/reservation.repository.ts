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

  /**
   * Đếm tổng số lượng hàng đã được "chiếm giữ" bởi reservation đang hoạt động.
   *
   * Dùng để phục hồi Redis stock key khi bị mất (Redis restart, key expire).
   * Công thức: stock_thực_tế = saleQuantity - sumActiveQuantity
   *
   * Active = HOLDING (đang giữ chỗ chờ thanh toán) + PAID (đã thanh toán xong).
   * EXPIRED và các trạng thái khác không tính — hàng đã được hoàn lại.
   *
   * @returns Tổng quantity của tất cả reservation HOLDING + PAID
   */
  async sumActiveQuantityByCampaignProduct(
    campaignProductId: string
  ): Promise<number> {
    const result = await this.prisma.reservation.aggregate({
      where: {
        campaignProductId,
        status: { in: [ReservationStatus.HOLDING, ReservationStatus.PAID] }
      },
      _sum: { quantity: true }
    })
    return result._sum.quantity ?? 0
  }

  /** fallback khi Redis key mất — lấy dữ liệu reservation từ DB để restore stock */
  async findWithCampaignProductById(reservationId: string) {
    return this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        customerId: true,
        quantity: true,
        status: true,
        campaignProduct: {
          select: { id: true }
        }
      }
    })
  }

  /** tìm tất cả reservation HOLDING thuộc danh sách campaignProductIds */
  async findHoldingByCampaignProductIds(campaignProductIds: string[]): Promise<
    Array<{
      id: string
      customerId: string
      campaignProductId: string
      quantity: number
    }>
  > {
    return this.prisma.reservation.findMany({
      where: {
        campaignProductId: { in: campaignProductIds },
        status: ReservationStatus.HOLDING
      },
      select: {
        id: true,
        customerId: true,
        campaignProductId: true,
        quantity: true
      }
    })
  }

  async findActiveByCustomerId(customerId: string) {
    return this.prisma.reservation.findMany({
      where: {
        customerId,
        status: 'HOLDING',
        expiredAt: { gt: new Date() }
      },
      select: {
        id: true,
        expiredAt: true,
        quantity: true,
        campaignProduct: {
          select: {
            id: true,
            salePrice: true,
            campaign: { select: { id: true, name: true, status: true } },
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
      },
      orderBy: { expiredAt: 'asc' }
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
