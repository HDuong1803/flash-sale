import { Injectable } from '@nestjs/common'
import { Payment } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { id } })
  }

  async findReservationWithProduct(reservationId: string) {
    return this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        campaignProduct: {
          include: {
            product: {
              select: { merchantId: true, id: true, originalPrice: true }
            }
          }
        }
      }
    })
  }

  async updatePaymentSuccess(id: string, transactionId: string): Promise<void> {
    await this.prisma.payment.update({
      where: { id },
      data: { status: 'SUCCESS', transactionId, paidAt: new Date() }
    })
  }

  async updatePaymentFailed(id: string): Promise<void> {
    await this.prisma.payment.update({
      where: { id },
      data: { status: 'FAILED' }
    })
  }

  async createOrderWithItems(data: {
    customerId: string
    merchantId: string
    reservationId: string
    totalAmount: number
    shippingAddress: string
    productId: string
    quantity: number
    unitPrice: number
    originalPrice: number
    paymentId: string
  }) {
    return this.prisma.$transaction(async tx => {
      // Create order
      const order = await tx.order.create({
        data: {
          customerId: data.customerId,
          merchantId: data.merchantId,
          reservationId: data.reservationId,
          status: 'CONFIRMED',
          totalAmount: data.totalAmount,
          shippingAddress: data.shippingAddress,
          items: {
            create: [
              {
                productId: data.productId,
                quantity: data.quantity,
                unitPrice: data.unitPrice,
                originalPrice: data.originalPrice
              }
            ]
          }
        }
      })

      // Link payment to the new order
      await tx.payment.update({
        where: { id: data.paymentId },
        data: { orderId: order.id }
      })

      // Deduct physical inventory
      await tx.inventory.updateMany({
        where: { productId: data.productId, warehouseId: 'default' },
        data: { quantity: { decrement: data.quantity } }
      })

      // Audit log
      await tx.stockAuditLog.create({
        data: {
          productId: data.productId,
          delta: -data.quantity,
          stockBefore: 0,
          stockAfter: 0,
          reason: 'RESERVATION',
          referenceId: data.reservationId,
          triggeredBy: data.customerId
        }
      })

      return order
    })
  }
}
