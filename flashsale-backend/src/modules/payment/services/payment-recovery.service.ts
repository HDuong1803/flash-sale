import { Injectable, Logger } from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { PaymentRepository } from '../repositories/payment.repository'
import {
  SagaCoordinatorService,
  CheckoutDataExpiredException
} from './saga-coordinator.service'

/**
 * Số phút sau đó coi payment là "stuck" và cần retry.
 * 10 phút: webhook timeout thường < 30s, nên 10 phút là đủ an toàn.
 */
const STUCK_AFTER_MINUTES = 10

/**
 * Sau bao nhiêu phút trong PROCESSING thì báo CRITICAL — cần xử lý thủ công.
 * 60 phút: nếu vẫn không xử lý được sau 1 giờ → ops team cần vào xem.
 */
const CRITICAL_STUCK_MINUTES = 60

/**
 * PaymentRecoveryService — tự động phát hiện và khôi phục payment bị kẹt.
 *
 * Tình huống cần recover:
 * Payment ở trạng thái PROCESSING mà không có orderId sau > 10 phút.
 * Nghĩa là: tiền đã nhận (SePay webhook đã xử lý) nhưng saga thất bại
 * vì checkout data Redis hết hạn, DB timeout, hoặc saga process crash.
 *
 * Chiến lược recovery:
 * 1. Thử lại saga với transactionId từ webhook log
 * 2. Nếu saga thành công → payment → SUCCESS, order được tạo
 * 3. Nếu saga fail vì checkout data expired → vẫn stuck → cần thủ công
 * 4. Nếu stuck > 60 phút → log CRITICAL + Sentry alert
 *
 * Service này được gọi bởi SchedulerService (cron job mỗi 10 phút).
 * KHÔNG nên gọi trực tiếp từ webhook handler (blocking).
 */
@Injectable()
export class PaymentRecoveryService {
  private readonly logger = new Logger(PaymentRecoveryService.name)

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly saga: SagaCoordinatorService
  ) {}

  /**
   * Quét và recover các payment bị kẹt trong PROCESSING.
   * Được gọi mỗi 10 phút bởi SchedulerService.
   */
  async recoverStuckPayments(): Promise<void> {
    const stuckPayments =
      await this.paymentRepository.findStuckProcessingPayments(
        STUCK_AFTER_MINUTES
      )

    if (stuckPayments.length === 0) return

    this.logger.warn({
      event: 'recovery_scan_found_stuck',
      count: stuckPayments.length
    })

    for (const payment of stuckPayments) {
      await this.attemptRecovery(payment)
    }
  }

  private async attemptRecovery(payment: {
    id: string
    reservationId: string | null
    amount: unknown
    updatedAt: Date
    webhookLogs: Array<{ id: string; transactionId: string | null }>
  }): Promise<void> {
    const paymentId = payment.id
    const stuckMinutes = Math.floor(
      (Date.now() - payment.updatedAt.getTime()) / 60_000
    )

    // ── Báo CRITICAL nếu stuck quá lâu (cần xử lý thủ công) ──────────────
    if (stuckMinutes >= CRITICAL_STUCK_MINUTES) {
      this.logger.error({
        event: 'payment_stuck_critical',
        paymentId,
        stuckMinutes,
        alert: 'CRITICAL — payment PROCESSING > 1 giờ, cần xử lý thủ công'
      })
      // Gửi lên Sentry để alert ops team
      Sentry.captureMessage(
        `Payment ${paymentId} stuck in PROCESSING for ${stuckMinutes} minutes`,
        {
          level: 'error',
          tags: { event: 'payment_stuck_critical', paymentId },
          extra: { stuckMinutes, amount: String(payment.amount) }
        }
      )
      return // Không retry nữa — chờ thủ công
    }

    // ── Lấy transactionId để re-run saga ─────────────────────────────────
    const webhookLog = payment.webhookLogs[0]
    if (!webhookLog?.transactionId) {
      this.logger.warn({
        event: 'recovery_no_transaction_id',
        paymentId,
        note: 'Không có transactionId để retry saga — cần xử lý thủ công'
      })
      return
    }

    this.logger.log({
      event: 'recovery_attempt',
      paymentId,
      stuckMinutes,
      transactionId: webhookLog.transactionId
    })

    // ── Retry saga ───────────────────────────────────────────────────────
    try {
      await this.saga.confirmPayment(paymentId, webhookLog.transactionId)

      // Đánh dấu webhook log đã xử lý thành công
      await this.paymentRepository.markWebhookLogProcessed(webhookLog.id)

      this.logger.log({
        event: 'recovery_success',
        paymentId,
        stuckMinutes
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'

      if (err instanceof CheckoutDataExpiredException) {
        // Checkout data đã hết hạn trong Redis — không thể tự recover
        // Cần ops team liên hệ khách lấy địa chỉ giao hàng
        this.logger.error({
          event: 'recovery_checkout_expired',
          paymentId,
          stuckMinutes,
          alert: 'Checkout data expired — cần lấy địa chỉ giao hàng thủ công'
        })
        Sentry.captureMessage(
          `Payment ${paymentId}: checkout data expired, order cannot be auto-created`,
          {
            level: 'error',
            tags: { event: 'recovery_checkout_expired', paymentId },
            extra: { stuckMinutes, amount: String(payment.amount) }
          }
        )
      } else {
        // Lỗi tạm thời — sẽ retry lần sau (cron job 10 phút)
        this.logger.warn({
          event: 'recovery_failed',
          paymentId,
          stuckMinutes,
          error: message,
          note: 'Sẽ retry trong 10 phút tới'
        })
      }
    }
  }
}
