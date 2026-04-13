import { PaymentMethod } from '@prisma/client'

export interface CreatePaymentLinkInput {
  paymentId: string
  amount: number
  description: string
  returnUrl: string
  cancelUrl: string
  /** Customer email để prefill trên Stripe Checkout */
  customerEmail?: string
  /** Customer full name để prefill qua Stripe Customer object */
  customerName?: string
  /** Stripe Connect: connected account ID của merchant */
  destinationAccountId?: string
  /** Stripe Connect: phí nền tảng (VND, zero-decimal) */
  applicationFeeAmount?: number
}

export interface PaymentGatewayProvider {
  method: PaymentMethod
  createPaymentLink(
    input: CreatePaymentLinkInput,
    gatewayConfig?: Record<string, unknown> | null
  ): Promise<string>
}
