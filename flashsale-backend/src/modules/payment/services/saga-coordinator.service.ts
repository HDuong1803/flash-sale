import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional
} from '@nestjs/common'
import { NotificationType, PaymentStatus } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { ReservationService } from '@modules/reservation/services/reservation.service'
import { NotificationService } from '@modules/notification/services/notification.service'
import { FulfillmentService } from '@modules/fulfillment/services/fulfillment.service'
import { PaymentRepository } from '../repositories/payment.repository'

/**
 * Exception đặc biệt: dữ liệu checkout đã hết hạn trong Redis.
 *
 * Khác với lỗi thông thường: khi gặp exception này, KHÔNG được rollback
 * vì tiền đã được nhận. Payment sẽ ở trạng thái PROCESSING để recovery job xử lý sau.
 *
 * Recovery job cần: tìm payment.status=PROCESSING không có orderId → retry saga
 * hoặc báo admin xử lý thủ công (liên hệ khách lấy địa chỉ giao hàng).
 */
export class CheckoutDataExpiredException extends Error {
  constructor(
    public readonly paymentId: string,
    public readonly reservationId: string
  ) {
    super(
      `Dữ liệu checkout đã hết hạn: paymentId=${paymentId}, reservationId=${reservationId}`
    )
    this.name = 'CheckoutDataExpiredException'
  }
}

@Injectable()
export class SagaCoordinatorService {
  private readonly logger = new Logger(SagaCoordinatorService.name)

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly redis: RedisService,
    private readonly reservationService: ReservationService,
    private readonly notificationService: NotificationService,
    // Optional: FulfillmentModule có thể chưa được load trong test environments
    @Optional()
    private readonly fulfillmentService: FulfillmentService | null = null
  ) {}

  async confirmPayment(
    paymentId: string,
    transactionId: string
  ): Promise<void> {
    const payment = await this.paymentRepository.findById(paymentId)
    if (!payment) throw new NotFoundException('Thanh toán không tồn tại')

    if (
      payment.status === PaymentStatus.SUCCESS ||
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.CANCELLED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      this.logger.warn(
        `Payment ${paymentId} already processed: ${payment.status}`
      )
      return
    }

    if (payment.status === PaymentStatus.PENDING) {
      const claimed = await this.paymentRepository.claimPaymentForProcessing(
        paymentId
      )
      if (!claimed) {
        this.logger.warn(
          `Payment ${paymentId} already claimed by another worker`
        )
        return
      }
    }

    const reservationId = payment.reservationId
    if (!reservationId)
      throw new BadRequestException('Thanh toán không liên kết với đơn giữ chỗ')

    const resv = await this.paymentRepository.findReservationWithProduct(
      reservationId
    )
    if (!resv) throw new NotFoundException('Giữ chỗ không tồn tại')

    let shippingAddress = (resv.shippingAddress ?? '').trim()

    // Fallback Redis cho dữ liệu cũ/edge-case chưa đồng bộ DB.
    if (!shippingAddress) {
      const checkoutRaw = await this.redis.client.get(
        `checkout:addr:${reservationId}`
      )

      if (checkoutRaw) {
        const checkoutData = JSON.parse(checkoutRaw) as {
          shippingAddress?: string
        }
        shippingAddress = checkoutData.shippingAddress?.trim() ?? ''

        if (shippingAddress) {
          await this.paymentRepository.updateReservationShippingAddress(
            reservationId,
            shippingAddress
          )
        }
      }
    }

    if (!shippingAddress) {
      this.logger.error({
        event: 'saga_checkout_data_expired',
        paymentId,
        reservationId,
        alert:
          'CRITICAL — tiền đã nhận nhưng thiếu địa chỉ giao hàng, cần xử lý thủ công'
      })
      throw new CheckoutDataExpiredException(paymentId, reservationId)
    }

    try {
      // Bước 1: Tạo đơn hàng + trừ tồn kho (trong 1 DB transaction)
      // Phải tạo order TRƯỚC khi đánh dấu payment SUCCESS.
      // Nếu tạo order thất bại, payment vẫn ở PROCESSING → rollback an toàn.
      const order = await this.paymentRepository.createOrderWithItems({
        customerId: resv.customerId,
        merchantId: resv.campaignProduct.product.merchantId,
        reservationId,
        totalAmount: Number(resv.campaignProduct.salePrice) * resv.quantity,
        shippingAddress,
        productId: resv.campaignProduct.productId,
        quantity: resv.quantity,
        unitPrice: Number(resv.campaignProduct.salePrice),
        originalPrice: Number(resv.campaignProduct.product.originalPrice),
        paymentId,
        idempotencyKey: paymentId,
        campaignId: resv.campaignProduct.campaign.id,
        commissionRate: Number(resv.campaignProduct.campaign.commissionRate),
        commissionCategoryId: resv.campaignProduct.campaign.commissionCategoryId
      })

      // Bước 2: Đánh dấu thanh toán thành công (order đã tồn tại, an toàn để set SUCCESS)
      await this.paymentRepository.updatePaymentSuccess(
        paymentId,
        transactionId
      )

      // Bước 3: Giải phóng reservation trong Redis
      await this.reservationService.markAsPaid(reservationId)

      // Bước 4: Thông báo cho khách hàng
      await this.notificationService.createNotification(resv.customerId, {
        type: NotificationType.ORDER_CONFIRMED,
        title: 'Đặt hàng thành công!',
        message: 'Đơn hàng của bạn đã được xác nhận và đang được xử lý.'
      })

      // Bước 5: Publish sự kiện lên dashboard real-time
      await this.redis.publishDashboardEvent(resv.campaignProduct.campaignId, {
        type: 'ORDER_CONFIRMED',
        orderId: order.id,
        revenue: order.totalAmount,
        timestamp: new Date().toISOString()
      })

      // Bước 6: Khởi tạo fulfillment (fire-and-forget — KHÔNG được làm saga fail)
      // initializeFulfillment tự xử lý lỗi internally và không throw.
      if (this.fulfillmentService) {
        void this.fulfillmentService.initializeFulfillment({
          orderId: order.id,
          shippingAddress,
          totalAmount: String(order.totalAmount),
          merchantId: resv.campaignProduct.product.merchantId,
          campaignId: resv.campaignProduct.campaign.id
        })
      }

      this.logger.log({ event: 'saga_confirmed', orderId: order.id, paymentId })
    } catch (err: unknown) {
      // CheckoutDataExpiredException: đã được throw trước try block → không bao giờ vào đây
      // Các lỗi khác (DB, Redis, ...): rollback an toàn vì payment chưa được đánh dấu SUCCESS
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      this.logger.error({
        event: 'saga_forward_failed',
        paymentId,
        error: message
      })
      await this.rollbackPayment(paymentId, reservationId)
      throw err
    }
  }

  async rollbackPayment(
    paymentId: string,
    reservationId: string
  ): Promise<void> {
    const resv = await this.paymentRepository.findReservationWithProduct(
      reservationId
    )

    await this.paymentRepository.updatePaymentFailed(paymentId)

    if (resv) {
      // releaseReservation xử lý toàn bộ: restore stock + decrement purchase counter + cleanup
      // KHÔNG gọi incrementStock riêng — tránh double restore
      await this.reservationService.releaseReservation(
        reservationId,
        'PAYMENT_FAILED'
      )

      await this.notificationService.createNotification(resv.customerId, {
        type: NotificationType.PAYMENT_FAILED,
        title: 'Thanh toán thất bại',
        message:
          'Đặt hàng thất bại. Tồn kho đã được hoàn trả. Vui lòng thử lại.'
      })
    }

    this.logger.log(`Saga rolled back: paymentId=${paymentId}`)
  }
}
