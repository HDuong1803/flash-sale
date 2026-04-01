import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentStatus } from '@prisma/client'
import { PaymentRepository } from '../repositories/payment.repository'
import { SagaCoordinatorService } from './saga-coordinator.service'
import { PaymentWebhookDto } from '../dto/payment.dto'
import { StripeService } from './stripe.service'

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name)
  // Cho phép tuỳ chỉnh qua env, mặc định 30 giây
  // Lý do tăng từ 7.5s lên 30s: transaction DB có thể chậm khi DB load cao
  private readonly webhookTimeoutMs: number

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly saga: SagaCoordinatorService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService
  ) {
    this.webhookTimeoutMs = this.configService.get<number>(
      'timeouts.WEBHOOK_TIMEOUT_MS',
      30_000
    )
  }

  async handleStripeWebhook(
    payload: Buffer,
    signatureHeader?: string
  ): Promise<{ received: boolean }> {
    const verified = this.stripeService.verifyWebhookSignature(
      payload,
      signatureHeader
    )
    if (!verified) return { received: false }

    const event = JSON.parse(payload.toString('utf8')) as {
      type?: string
      data?: {
        object?: {
          id?: string
          metadata?: { paymentId?: string }
          amount_total?: number
          payment_status?: string
        }
      }
    }

    if (event.type !== 'checkout.session.completed') {
      return { received: true }
    }

    const session = event.data?.object
    const paymentId = session?.metadata?.paymentId
    const transactionId = session?.id
    const amount = session?.amount_total
    if (!paymentId || !transactionId || typeof amount !== 'number') {
      await this.paymentRepository.createWebhookLog({
        paymentId: null,
        provider: 'stripe',
        transactionId: transactionId ?? `stripe-${Date.now()}`,
        payload: event as unknown as Record<string, unknown>,
        processed: false,
        errorMessage: 'Thiếu paymentId/transactionId/amount từ Stripe webhook'
      })
      return { received: true }
    }

    const existingLog =
      await this.paymentRepository.findWebhookLogByTransactionId(transactionId)
    if (existingLog) return { received: true }

    const payment = await this.paymentRepository.findById(paymentId)
    if (!payment) {
      await this.paymentRepository.createWebhookLog({
        paymentId: null,
        provider: 'stripe',
        transactionId,
        payload: event as unknown as Record<string, unknown>,
        processed: false,
        errorMessage: `Payment không tồn tại: ${paymentId}`
      })
      return { received: true }
    }

    if (payment.status !== PaymentStatus.PENDING) {
      return { received: true }
    }

    if (Math.round(Number(payment.amount)) !== Math.round(amount)) {
      await this.paymentRepository.createWebhookLog({
        paymentId,
        provider: 'stripe',
        transactionId,
        payload: event as unknown as Record<string, unknown>,
        processed: false,
        errorMessage: `Số tiền không khớp: expected=${payment.amount}, received=${amount}`
      })
      return { received: true }
    }

    const claimed = await this.paymentRepository.claimPaymentForProcessing(paymentId)
    if (!claimed) return { received: true }

    const webhookLog = await this.paymentRepository.createWebhookLog({
      paymentId,
      provider: 'stripe',
      transactionId,
      payload: event as unknown as Record<string, unknown>,
      processed: false
    })

    try {
      await Promise.race([
        this.saga.confirmPayment(paymentId, transactionId),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Saga timeout sau ${this.webhookTimeoutMs / 1000}s`)),
            this.webhookTimeoutMs
          )
        )
      ])
      await this.paymentRepository.markWebhookLogProcessed(webhookLog.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      this.logger.error({
        event: 'stripe_saga_failed',
        paymentId,
        error: message
      })
    }

    return { received: true }
  }

  // ─── Generic webhook (legacy) ───────────────────────────────────────────────

  async handleWebhook(dto: PaymentWebhookDto): Promise<{ received: boolean }> {
    const payment = await this.paymentRepository.findById(dto.paymentId)
    if (!payment) {
      this.logger.warn(`Webhook for unknown paymentId=${dto.paymentId}`)
      return { received: false }
    }

    // Idempotency: bỏ qua nếu đã xử lý
    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.log(
        `Webhook duplicate for paymentId=${dto.paymentId}, status=${payment.status}`
      )
      return { received: true }
    }

    if (dto.status === 'success') {
      await this.saga.confirmPayment(dto.paymentId, dto.transactionId)
    } else {
      const reservationId = payment.reservationId
      if (reservationId) {
        await this.saga.rollbackPayment(dto.paymentId, reservationId)
      }
    }

    return { received: true }
  }

  // ─── Payment status ─────────────────────────────────────────────────────────

  /**
   * Lấy trạng thái thanh toán cho frontend polling.
   *
   * Frontend dùng endpoint này để kiểm tra mỗi vài giây.
   * Khi status = SUCCESS → frontend tự redirect về trang xác nhận đơn hàng.
   *
   * Bảo mật: chỉ owner của payment mới được xem (kiểm tra qua reservation.customerId).
   */
  async getPaymentStatus(
    paymentId: string,
    requestingUserId: string
  ): Promise<{ status: PaymentStatus; orderId: string | null }> {
    const payment = await this.paymentRepository.findStatusById(paymentId)

    if (!payment) {
      throw new NotFoundException('Không tìm thấy thông tin thanh toán')
    }

    // Kiểm tra quyền sở hữu — không cho phép xem payment của người khác
    const customerId = payment.reservation?.customerId
    if (customerId && customerId !== requestingUserId) {
      // Trả về 404 thay vì 403 để tránh enumeration attack
      // (không tiết lộ rằng payment tồn tại nhưng không phải của user)
      throw new NotFoundException('Không tìm thấy thông tin thanh toán')
    }

    return {
      status: payment.status,
      orderId: payment.orderId ?? null
    }
  }
}
