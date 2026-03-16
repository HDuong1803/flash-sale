import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { RedisService } from '@infrastructure/redis/redis.service'
import { ReservationService } from '@modules/reservation/services/reservation.service'
import { NotificationService } from '@modules/notification/services/notification.service'
import { PaymentRepository } from '../repositories/payment.repository'

@Injectable()
export class SagaCoordinatorService {
  private readonly logger = new Logger(SagaCoordinatorService.name)

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly redis: RedisService,
    private readonly reservationService: ReservationService,
    private readonly notificationService: NotificationService
  ) {}

  async confirmPayment(
    paymentId: string,
    transactionId: string
  ): Promise<void> {
    const payment = await this.paymentRepository.findById(paymentId)
    if (!payment) throw new NotFoundException('Payment không tồn tại')
    if (payment.status !== 'PENDING') {
      this.logger.warn(
        `Payment ${paymentId} already processed: ${payment.status}`
      )
      return
    }

    const reservationId = payment.reservationId
    if (!reservationId)
      throw new BadRequestException('Payment không liên kết với reservation')

    // Read checkout data stored during initiate()
    const checkoutRaw = await this.redis.client.get(
      `checkout:addr:${reservationId}`
    )
    if (!checkoutRaw)
      throw new BadRequestException('Dữ liệu checkout đã hết hạn')
    const { shippingAddress } = JSON.parse(checkoutRaw) as {
      shippingAddress: string
    }

    const resv = await this.paymentRepository.findReservationWithProduct(
      reservationId
    )
    if (!resv) throw new NotFoundException('Reservation không tồn tại')

    try {
      // Step 1: Mark payment SUCCESS
      await this.paymentRepository.updatePaymentSuccess(
        paymentId,
        transactionId
      )

      // Step 2: Create order + deduct inventory (in DB transaction)
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
        paymentId
      })

      // Step 3: Clear reservation from Redis
      await this.reservationService.markAsPaid(reservationId)

      // Step 4: Notify customer
      await this.notificationService.createNotification(resv.customerId, {
        type: 'ORDER_CONFIRMED',
        title: 'Đặt hàng thành công!',
        message: 'Đơn hàng của bạn đã được xác nhận và đang được xử lý.'
      })

      // Step 5: Publish dashboard event
      await this.redis.publishDashboardEvent(resv.campaignProduct.campaignId, {
        type: 'ORDER_CONFIRMED',
        orderId: order.id,
        revenue: order.totalAmount,
        timestamp: new Date().toISOString()
      })

      this.logger.log(`Saga confirmed: orderId=${order.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      this.logger.error(`Saga forward failed, rolling back: ${message}`)
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
      // Restore stock in Redis
      await this.redis.incrementStock(resv.campaignProduct.id, resv.quantity)
      await this.reservationService.releaseReservation(
        reservationId,
        'PAYMENT_FAILED'
      )

      await this.notificationService.createNotification(resv.customerId, {
        type: 'PAYMENT_FAILED',
        title: 'Thanh toán thất bại',
        message:
          'Đặt hàng thất bại. Tồn kho đã được hoàn trả. Vui lòng thử lại.'
      })
    }

    this.logger.log(`Saga rolled back: paymentId=${paymentId}`)
  }
}
