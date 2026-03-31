import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentStatus } from '@prisma/client'
import { PaymentRepository } from '../repositories/payment.repository'
import {
  SagaCoordinatorService,
  CheckoutDataExpiredException
} from './saga-coordinator.service'
import { PaymentWebhookDto } from '../dto/payment.dto'
import { SepayWebhookDto } from '../dto/sepay-webhook.dto'
import { SepayService } from './sepay.service'

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name)
  // Cho phép tuỳ chỉnh qua env, mặc định 30 giây
  // Lý do tăng từ 7.5s lên 30s: transaction DB có thể chậm khi DB load cao
  private readonly webhookTimeoutMs: number

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly saga: SagaCoordinatorService,
    private readonly sepayService: SepayService,
    private readonly configService: ConfigService
  ) {
    this.webhookTimeoutMs = this.configService.get<number>(
      'timeouts.WEBHOOK_TIMEOUT_MS',
      30_000
    )
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

  // ─── SePay webhook handler ──────────────────────────────────────────────────

  /**
   * Xử lý webhook từ SePay khi phát hiện giao dịch ngân hàng.
   *
   * Luồng xử lý:
   * 1. Bỏ qua nếu không phải tiền vào (transferType != 'in')
   * 2. Trích xuất paymentId từ nội dung chuyển khoản
   * 3. Tìm Payment trong DB, kiểm tra tồn tại
   * 4. Xác minh số tiền khớp chính xác
   * 5. ATOMIC CLAIM: chuyển PENDING → PROCESSING (optimistic lock, chỉ 1 caller thành công)
   * 6. Ghi log webhook (processed: false — sẽ cập nhật thành true sau khi saga hoàn tất)
   * 7. Chạy saga để xác nhận thanh toán + tạo đơn hàng
   * 8. Cập nhật log → processed: true
   *
   * KHÔNG throw exception — luôn return { success } để tránh SePay retry storm.
   *
   * Race condition protection:
   * - Bước 5 dùng DB-level atomic update: chỉ 1 instance có thể claim payment
   * - Nếu 2 webhook đến cùng lúc: cả 2 vượt qua bước 3 (findById), nhưng
   *   chỉ 1 cái thành công ở bước 5 (updateMany với WHERE status=PENDING)
   */
  async handleSepayWebhook(
    dto: SepayWebhookDto
  ): Promise<{ success: boolean }> {
    // ── Bước 1: Chỉ xử lý tiền vào ──────────────────────────────────────────
    if (dto.transferType !== 'in') {
      return { success: true }
    }

    // ── Bước 2: Trích xuất paymentId ─────────────────────────────────────────
    const paymentId = this.sepayService.extractPaymentId(dto.code, dto.content)
    if (!paymentId) {
      this.logger.warn({
        event: 'sepay_webhook_no_payment_id',
        sePayId: dto.id,
        referenceCode: dto.referenceCode
        // Không log dto.content đầy đủ — có thể chứa thông tin nhạy cảm
      })
      await this.paymentRepository.createWebhookLog({
        paymentId: null,
        provider: 'sepay',
        transactionId: dto.referenceCode,
        payload: {
          id: dto.id,
          amount: dto.transferAmount,
          gateway: dto.gateway
        },
        processed: false,
        errorMessage: 'Không thể trích xuất paymentId từ nội dung chuyển khoản'
      })
      return { success: true }
    }

    // ── Bước 3: Tìm Payment record ───────────────────────────────────────────
    const payment = await this.paymentRepository.findById(paymentId)
    if (!payment) {
      this.logger.warn({
        event: 'sepay_webhook_payment_not_found',
        paymentId,
        referenceCode: dto.referenceCode
      })
      await this.paymentRepository.createWebhookLog({
        paymentId: null,
        provider: 'sepay',
        transactionId: dto.referenceCode,
        payload: { id: dto.id, amount: dto.transferAmount, paymentId },
        processed: false,
        errorMessage: `Payment không tồn tại: ${paymentId}`
      })
      return { success: true }
    }

    // ── Bước 4: Xác minh số tiền ─────────────────────────────────────────────
    // Phải khớp chính xác — không cho phép underpayment hay overpayment
    if (dto.transferAmount !== Number(payment.amount)) {
      this.logger.warn({
        event: 'sepay_amount_mismatch',
        paymentId,
        expected: Number(payment.amount),
        received: dto.transferAmount,
        referenceCode: dto.referenceCode
        // ⚠️ Cần alert manual review — có thể là lỗi của khách hoặc fraud attempt
      })
      await this.paymentRepository.createWebhookLog({
        paymentId,
        provider: 'sepay',
        transactionId: dto.referenceCode,
        payload: {
          id: dto.id,
          received: dto.transferAmount,
          expected: Number(payment.amount)
        },
        processed: false,
        errorMessage: `Số tiền không khớp: expected=${payment.amount}, received=${dto.transferAmount}`
      })
      return { success: false }
    }

    // ── Bước 5: Atomic claim — chuyển PENDING → PROCESSING ───────────────────
    // Đây là điểm bảo vệ race condition quan trọng nhất:
    // updateMany với WHERE status=PENDING là atomic trong PostgreSQL.
    // Nếu 2 webhook đến cùng lúc: chỉ 1 cái nhận count=1, cái còn lại nhận count=0.
    const claimed = await this.paymentRepository.claimPaymentForProcessing(
      paymentId
    )
    if (!claimed) {
      // Payment đã được claim bởi webhook khác (concurrent hoặc đã xử lý rồi)
      this.logger.log({
        event: 'sepay_webhook_already_claimed',
        paymentId,
        currentStatus: payment.status, // lấy từ findById ở trên (có thể stale)
        referenceCode: dto.referenceCode
      })
      return { success: true }
    }

    // ── Bước 6: Ghi log webhook (audit trail) ────────────────────────────────
    // Ghi sau khi đã claim để đảm bảo chỉ 1 log tồn tại cho mỗi transaction.
    // processed=false ban đầu — sẽ cập nhật thành true sau khi saga hoàn tất.
    const webhookLog = await this.paymentRepository.createWebhookLog({
      paymentId,
      provider: 'sepay',
      transactionId: dto.referenceCode,
      payload: { id: dto.id, amount: dto.transferAmount, gateway: dto.gateway },
      processed: false
    })

    // ── Bước 7: Chạy saga xác nhận thanh toán ───────────────────────────────
    try {
      await Promise.race([
        this.saga.confirmPayment(paymentId, dto.referenceCode),
        // Timeout: nếu saga chạy quá lâu → return success:true để tránh SePay retry
        // Payment ở trạng thái PROCESSING, recovery job sẽ xử lý sau
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Saga timeout sau ${this.webhookTimeoutMs / 1000}s`)
              ),
            this.webhookTimeoutMs
          )
        )
      ])

      // ── Bước 8: Đánh dấu log đã xử lý thành công ────────────────────────
      await this.paymentRepository.markWebhookLogProcessed(webhookLog.id)

      this.logger.log({
        event: 'sepay_webhook_processed',
        paymentId,
        referenceCode: dto.referenceCode
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      const stack = err instanceof Error ? err.stack : undefined

      if (err instanceof CheckoutDataExpiredException) {
        // Dữ liệu checkout hết hạn — KHÔNG rollback, tiền đã nhận.
        // Payment ở trạng thái PROCESSING, recovery job sẽ xử lý.
        this.logger.error({
          event: 'sepay_checkout_expired',
          paymentId,
          error: message,
          alert:
            'CRITICAL — payment PROCESSING không có order, cần xử lý thủ công'
        })
      } else {
        // Lỗi khác (DB, network, ...) — saga đã rollback payment về FAILED
        this.logger.error({
          event: 'sepay_saga_failed',
          paymentId,
          error: message,
          stack,
          // Recovery job sẽ scan payment.status=PROCESSING không có orderId
          note: 'Saga failed after claiming — payment in PROCESSING state'
        })
      }
      // Không throw — tránh SePay retry storm
    }

    return { success: true }
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
