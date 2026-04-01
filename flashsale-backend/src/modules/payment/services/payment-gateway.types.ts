import { PaymentMethod } from '@prisma/client'

export interface CreatePaymentLinkInput {
  paymentId: string
  amount: number
  description: string
  returnUrl: string
  cancelUrl: string
}

export interface PaymentGatewayProvider {
  method: PaymentMethod
  createPaymentLink(
    input: CreatePaymentLinkInput,
    gatewayConfig?: Record<string, unknown> | null
  ): Promise<string>
}

