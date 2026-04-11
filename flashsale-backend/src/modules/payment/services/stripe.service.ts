import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentMethod } from '@prisma/client'
import axios from 'axios'
import type {
  CreatePaymentLinkInput,
  PaymentGatewayProvider
} from './payment-gateway.types'
import * as crypto from 'crypto'

@Injectable()
export class StripeService implements PaymentGatewayProvider {
  readonly method = PaymentMethod.STRIPE
  private readonly logger = new Logger(StripeService.name)

  constructor(private readonly configService: ConfigService) {}

  async createPaymentLink(
    input: CreatePaymentLinkInput,
    gatewayConfig?: Record<string, unknown> | null
  ): Promise<string> {
    const apiKey =
      (gatewayConfig?.stripeSecretKey as string | undefined) ||
      this.configService.get<string>('stripe.STRIPE_SECRET_KEY', '')

    if (!apiKey) {
      throw new BadRequestException('Thiếu STRIPE_SECRET_KEY')
    }

    const successUrl = `${input.returnUrl}?status=success&paymentId=${input.paymentId}`
    const cancelUrl = `${input.cancelUrl}?status=cancelled&paymentId=${input.paymentId}`

    const form = new URLSearchParams()
    form.append('mode', 'payment')
    form.append('success_url', successUrl)
    form.append('cancel_url', cancelUrl)
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
    form.append('metadata[paymentId]', input.paymentId)
    form.append('metadata[gateway]', PaymentMethod.STRIPE)

    // Stripe Connect: Destination Charges
    // Tiền vào platform trước, Stripe auto-transfer sang merchant sau khi trừ fee
    if (input.destinationAccountId) {
      form.append(
        'payment_intent_data[transfer_data][destination]',
        input.destinationAccountId
      )
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

    const response = await axios.post(
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

    const url = response.data?.url as string | undefined
    if (!url) throw new BadRequestException('Stripe không trả về checkout URL')

    this.logger.log({
      event: 'stripe_session_created',
      paymentId: input.paymentId,
      amount: input.amount
    })
    return url
  }

  verifyWebhookSignature(payload: Buffer, signatureHeader?: string): boolean {
    const webhookSecret = this.configService.get<string>(
      'stripe.STRIPE_WEBHOOK_SECRET',
      ''
    )
    if (!webhookSecret || !signatureHeader) return false

    const signature = this.extractV1Signature(signatureHeader)
    const timestamp = this.extractTimestamp(signatureHeader)
    if (!signature || !timestamp) return false

    const signedPayload = `${timestamp}.${payload.toString('utf8')}`
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex')

    const signatureBuf = Buffer.from(signature, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (signatureBuf.length !== expectedBuf.length) return false

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

  private extractTimestamp(signatureHeader: string): string | null {
    const part = signatureHeader
      .split(',')
      .find(item => item.trim().startsWith('t='))
    return part ? part.split('=')[1] ?? null : null
  }

  private extractV1Signature(signatureHeader: string): string | null {
    const part = signatureHeader
      .split(',')
      .find(item => item.trim().startsWith('v1='))
    return part ? part.split('=')[1] ?? null : null
  }
}
