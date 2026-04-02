import { Injectable } from '@nestjs/common'
import { OrderStatus, Payment, PaymentStatus, Prisma } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { id } })
  }

  /**
   * Lấy trạng thái payment kèm customerId để kiểm tra quyền sở hữu.
   *
   * Cần join qua Reservation vì Payment không lưu customerId trực tiếp.
   * Trả về null nếu payment không tồn tại hoặc không liên kết reservation.
   */
  async findStatusById(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        orderId: true,
        amount: true,
        // Lấy customerId qua reservation để kiểm tra quyền truy cập
        reservation: {
          select: { customerId: true }
        }
      }
    })
  }

  async findReservationWithProduct(reservationId: string) {
    return this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        campaignProduct: {
          include: {
            product: {
              select: { merchantId: true, id: true, originalPrice: true }
            },
            campaign: {
              select: {
                id: true,
                commissionRate: true,
                commissionCategoryId: true
              }
            }
          }
        }
      }
    })
  }

  async updatePaymentSuccess(id: string, transactionId: string): Promise<void> {
    await this.prisma.payment.update({
      where: { id },
      data: { status: PaymentStatus.SUCCESS, transactionId, paidAt: new Date() }
    })
  }

  async updatePaymentFailed(id: string): Promise<void> {
    await this.prisma.payment.update({
      where: { id },
      data: { status: PaymentStatus.FAILED }
    })
  }

  async updateReservationShippingAddress(
    reservationId: string,
    shippingAddress: string
  ): Promise<void> {
    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { shippingAddress }
    })
  }

  /**
   * Tìm các payment bị kẹt ở trạng thái PROCESSING mà không có orderId.
   *
   * Khi nào xảy ra:
   * - Webhook đã claim payment (PENDING → PROCESSING) nhưng saga thất bại
   * - Nguyên nhân: checkout data hết hạn, DB quá tải, saga timeout
   * - Hậu quả: tiền đã nhận nhưng đơn hàng chưa tạo
   *
   * Recovery job định kỳ quét các payment này và retry saga.
   * Sau CRITICAL_STUCK_MINUTES phút vẫn không xử lý được → cần xử lý thủ công.
   *
   * @param stuckForMinutes - bao nhiêu phút mới coi là "stuck" (default: 10)
   */
  async findStuckProcessingPayments(stuckForMinutes = 10) {
    const cutoffTime = new Date(Date.now() - stuckForMinutes * 60 * 1000)

    return this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PROCESSING,
        orderId: null,
        updatedAt: { lt: cutoffTime }
      },
      select: {
        id: true,
        reservationId: true,
        amount: true,
        updatedAt: true,
        // transactionId từ webhook log để re-run saga với cùng referenceCode
        webhookLogs: {
          where: { processed: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, transactionId: true }
        }
      },
      take: 20, // Batch size — tránh quá tải khi có nhiều payment stuck
      orderBy: { updatedAt: 'asc' }
    })
  }

  /**
   * Atomic optimistic lock — chuyển payment từ PENDING → PROCESSING.
   *
   * Dùng `updateMany` với điều kiện `status = PENDING` để đảm bảo:
   * - Chỉ 1 webhook caller có thể "claim" payment (count=1)
   * - Các caller khác (retry hoặc concurrent) nhận count=0 và biết phải bỏ qua
   *
   * Lý do không dùng findFirst + update riêng lẻ:
   * Nếu 2 webhook đến cùng lúc, cả 2 đều có thể vượt qua findFirst
   * và gây double-processing. updateMany với WHERE là atomic trong PostgreSQL.
   *
   * @returns true nếu claim thành công, false nếu đã có caller khác claim trước
   */
  async claimPaymentForProcessing(paymentId: string): Promise<boolean> {
    const result = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.PROCESSING }
    })
    return result.count > 0
  }

  async findWebhookLogByTransactionId(transactionId: string) {
    return this.prisma.paymentWebhookLog.findFirst({
      where: { transactionId }
    })
  }

  /**
   * Đánh dấu webhook log là đã xử lý thành công.
   * Gọi sau khi saga confirm payment hoàn tất.
   */
  async markWebhookLogProcessed(logId: string): Promise<void> {
    await this.prisma.paymentWebhookLog.update({
      where: { id: logId },
      data: { processed: true, processedAt: new Date() }
    })
  }

  async createWebhookLog(data: {
    paymentId: string | null
    provider: string
    transactionId: string
    payload: Record<string, unknown> | unknown[]
    processed: boolean
    errorMessage?: string
  }) {
    return this.prisma.paymentWebhookLog.create({
      data: {
        paymentId: data.paymentId,
        provider: data.provider,
        transactionId: data.transactionId,
        payload: data.payload as Prisma.InputJsonValue,
        processed: data.processed,
        processedAt: data.processed ? new Date() : null,
        errorMessage: data.errorMessage ?? null
      }
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
    idempotencyKey: string
    campaignId: string
    commissionRate: number
    commissionCategoryId?: string | null
  }) {
    return this.prisma.$transaction(async tx => {
      // Idempotency: nếu order đã tồn tại với idempotencyKey này → trả về luôn
      // Trường hợp: saga chạy 2 lần (retry hoặc race condition)
      const existingOrder = await tx.order.findFirst({
        where: { idempotencyKey: data.idempotencyKey }
      })
      if (existingOrder) {
        return existingOrder
      }

      // Create order
      const order = await tx.order.create({
        data: {
          customerId: data.customerId,
          merchantId: data.merchantId,
          reservationId: data.reservationId,
          idempotencyKey: data.idempotencyKey,
          status: OrderStatus.CONFIRMED,
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
        } satisfies Prisma.OrderUncheckedCreateInput
      })

      // Link payment to the new order
      await tx.payment.update({
        where: { id: data.paymentId },
        data: { orderId: order.id }
      })

      // Write commission ledger snapshot for finance dashboard
      const commissionAmount =
        Math.round(data.totalAmount * data.commissionRate * 100) / 100
      const netAmount =
        Math.round((data.totalAmount - commissionAmount) * 100) / 100

      await tx.commissionLedger.create({
        data: {
          orderId: order.id,
          paymentId: data.paymentId,
          campaignId: data.campaignId,
          merchantId: data.merchantId,
          commissionCategoryId: data.commissionCategoryId ?? null,
          commissionRate: data.commissionRate,
          grossAmount: data.totalAmount,
          commissionAmount,
          netAmount
        }
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
