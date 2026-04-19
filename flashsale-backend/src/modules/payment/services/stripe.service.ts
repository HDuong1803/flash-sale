import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentMethod } from '@prisma/client'
import axios, { type AxiosResponse } from 'axios'
import type {
  CreatePaymentLinkInput,
  PaymentGatewayProvider
} from './payment-gateway.types'
import * as crypto from 'crypto'

/**
 * StripeService — Provider thanh toán qua Stripe Checkout.
 *
 * Implements PaymentGatewayProvider để plug-in vào payment gateway
 * selector. Service này xử lý 2 luồng:
 *  1. Tạo Checkout Session (one-time payment) với hỗ trợ Destination Charges
 *     cho Stripe Connect (tiền vào platform → Stripe tự transfer sang merchant).
 *  2. Verify webhook signature bằng HMAC-SHA256 với timing-safe comparison
 *     để chống timing attack.
 */
@Injectable()
export class StripeService implements PaymentGatewayProvider {
  readonly method = PaymentMethod.STRIPE
  private readonly logger = new Logger(StripeService.name)

  constructor(private readonly configService: ConfigService) {}

  private async createCheckoutCustomer(
    apiKey: string,
    email: string,
    fullName?: string
  ): Promise<string | null> {
    const form = new URLSearchParams()
    form.append('email', email)
    if (fullName) {
      form.append('name', fullName)
    }

    try {
      const res = await axios.post<{ id?: string }>(
        'https://api.stripe.com/v1/customers',
        form.toString(),
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        }
      )

      return res.data?.id ?? null
    } catch {
      // Không fail checkout nếu Stripe customer prefill thất bại.
      return null
    }
  }

  /**
   * Tạo Stripe Checkout Session và trả về URL thanh toán.
   *
   * WHY Checkout Session thay vì PaymentIntent trực tiếp:
   *   - Stripe hosted page xử lý toàn bộ UX thanh toán (3DS, card validation, v.v.)
   *   - Platform không cần PCI DSS compliance vì không touch card data trực tiếp
   *
   * HOW Destination Charges (Stripe Connect):
   *   - `transfer_data[destination]` = stripeAccountId của merchant
   *   - `application_fee_amount` = phần platform giữ lại (VND, zero-decimal)
   *   - Stripe tự chuyển (total - fee) sang merchant sau khi capture
   *
   * @param input          Thông tin đơn hàng cần thanh toán
   * @param gatewayConfig  Override API key (multi-tenant / test mode)
   * @returns              URL Stripe Checkout để redirect user
   */
  async createPaymentLink(
    input: CreatePaymentLinkInput,
    gatewayConfig?: Record<string, unknown> | null
  ): Promise<string> {
    // Ưu tiên key từ gatewayConfig (multi-tenant config), fallback về env
    const apiKey =
      (gatewayConfig?.stripeSecretKey as string | undefined) ||
      this.configService.get<string>('stripe.STRIPE_SECRET_KEY', '')

    if (!apiKey) {
      throw new BadRequestException('Thiếu STRIPE_SECRET_KEY')
    }

    // Append paymentId vào success/cancel URL để backend có thể xử lý callback
    const successUrl = `${input.returnUrl}?status=success&paymentId=${input.paymentId}`
    const cancelUrl = `${input.cancelUrl}?status=cancelled&paymentId=${input.paymentId}`

    // Stripe API dùng application/x-www-form-urlencoded (không phải JSON)
    const form = new URLSearchParams()
    form.append('mode', 'payment')
    form.append('success_url', successUrl)
    form.append('cancel_url', cancelUrl)

    if (input.customerEmail) {
      const customerId = await this.createCheckoutCustomer(
        apiKey,
        input.customerEmail,
        input.customerName
      )

      if (customerId) {
        // Dùng customer khi có sẵn để Stripe prefill cả tên + email.
        // Không gửi đồng thời customer_email để tránh xung đột tham số.
        form.append('customer', customerId)
      } else {
        form.append('customer_email', input.customerEmail)
      }
    }

    // VND là zero-decimal currency — unit_amount = số VND nguyên (không x100)
    form.append('line_items[0][price_data][currency]', 'vnd')
    form.append(
      'line_items[0][price_data][product_data][name]',
      input.description
    )
    form.append(
      'line_items[0][price_data][unit_amount]',
      String(Math.round(input.amount))
    )
    form.append('line_items[0][quantity]', '1')

    // Metadata để webhook handler xác định đơn hàng tương ứng
    form.append('metadata[paymentId]', input.paymentId)
    form.append('metadata[gateway]', PaymentMethod.STRIPE)

    // ── Stripe Connect: Destination Charges ──────────────────────────────────
    // Mô hình: tiền vào platform account trước, Stripe tự-transfer sang merchant.
    // Điều này cho phép platform giữ lại application_fee trước khi release.
    // Chỉ áp dụng khi merchant đã hoàn tất Stripe Express onboarding (ACTIVE).
    if (input.destinationAccountId) {
      form.append(
        'payment_intent_data[transfer_data][destination]',
        input.destinationAccountId
      )

      // application_fee_amount: phần platform giữ lại (commission).
      // Nếu = 0 hoặc undefined → bỏ qua, Stripe transfer toàn bộ cho merchant.
      if (
        input.applicationFeeAmount !== undefined &&
        input.applicationFeeAmount > 0
      ) {
        form.append(
          'payment_intent_data[application_fee_amount]',
          String(Math.round(input.applicationFeeAmount))
        )
      }
    }

    let response: AxiosResponse<{ url?: string }>
    try {
      response = await axios.post(
        'https://api.stripe.com/v1/checkout/sessions',
        form.toString(),
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        }
      )
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        this.logger.error({
          event: 'stripe_api_error',
          status: err.response?.status,
          error: err.response?.data,
          paymentId: input.paymentId
        })
        const message =
          (err.response?.data as { error?: { message?: string } })?.error
            ?.message ?? err.message
        throw new BadRequestException(`Stripe lỗi: ${message}`)
      }
      throw err
    }

    const url = response.data?.url
    if (!url)
      throw new BadRequestException('Stripe không trả về đường dẫn thanh toán')

    this.logger.log({
      event: 'stripe_session_created',
      paymentId: input.paymentId,
      amount: input.amount
    })
    return url
  }

  /**
   * Xác thực chữ ký webhook từ Stripe.
   *
   * WHY timing-safe comparison:
   *   Nếu dùng `===` hoặc `.equals()` thông thường, attacker có thể đo thời gian
   *   phản hồi để đoán từng byte của HMAC (timing attack). crypto.timingSafeEqual
   *   đảm bảo comparison luôn tốn đúng một lượng thời gian bất kể kết quả.
   *
   * HOW Stripe webhook signature:
   *   Header `Stripe-Signature` format: `t=<timestamp>,v1=<hmac>`
   *   Signed payload = `<timestamp>.<raw-body-utf8>`
   *   HMAC = SHA-256 với key = STRIPE_WEBHOOK_SECRET
   *
   * @param payload          Raw request body Buffer (chưa parse JSON)
   * @param signatureHeader  Giá trị của header `Stripe-Signature`
   * @returns                true nếu signature hợp lệ
   */
  verifyWebhookSignature(payload: Buffer, signatureHeader?: string): boolean {
    const webhookSecret = this.configService.get<string>(
      'stripe.STRIPE_WEBHOOK_SECRET',
      ''
    )
    if (!webhookSecret || !signatureHeader) return false

    const signature = this.extractV1Signature(signatureHeader)
    const timestamp = this.extractTimestamp(signatureHeader)
    if (!signature || !timestamp) return false

    // Stripe signed payload: "<timestamp>.<raw_body>"
    const signedPayload = `${timestamp}.${payload.toString('utf8')}`
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex')

    const signatureBuf = Buffer.from(signature, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')

    // Nếu độ dài khác nhau → lỗi format, không cần compare (và timingSafeEqual sẽ throw)
    if (signatureBuf.length !== expectedBuf.length) return false

    // Wrap Buffer vào Uint8Array để tương thích với timingSafeEqual signature
    return crypto.timingSafeEqual(
      new Uint8Array(
        signatureBuf.buffer,
        signatureBuf.byteOffset,
        signatureBuf.byteLength
      ),
      new Uint8Array(
        expectedBuf.buffer,
        expectedBuf.byteOffset,
        expectedBuf.byteLength
      )
    )
  }

  /**
   * Tách timestamp `t=<value>` từ Stripe-Signature header.
   * Format header: `t=1614556800,v1=<hmac>,v0=<hmac-legacy>`
   */
  private extractTimestamp(signatureHeader: string): string | null {
    const part = signatureHeader
      .split(',')
      .find(item => item.trim().startsWith('t='))
    return part ? part.split('=')[1] ?? null : null
  }

  /**
   * Tách chữ ký v1 `v1=<hmac>` từ Stripe-Signature header.
   * v1 là SHA-256 HMAC — v0 là legacy, không dùng.
   */
  private extractV1Signature(signatureHeader: string): string | null {
    const part = signatureHeader
      .split(',')
      .find(item => item.trim().startsWith('v1='))
    return part ? part.split('=')[1] ?? null : null
  }
}
