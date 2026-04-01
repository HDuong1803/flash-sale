import { BadRequestException, Injectable } from '@nestjs/common'
import { PaymentMethod } from '@prisma/client'
import { StripeService } from './stripe.service'
import type { CreatePaymentLinkInput, PaymentGatewayProvider } from './payment-gateway.types'

@Injectable()
export class PaymentGatewayRegistry {
  private readonly providers: Map<PaymentMethod, PaymentGatewayProvider>

  constructor(
    private readonly stripeService: StripeService
  ) {
    this.providers = new Map<PaymentMethod, PaymentGatewayProvider>([
      [this.stripeService.method, this.stripeService]
    ])
  }

  async createPaymentLink(
    method: PaymentMethod,
    input: CreatePaymentLinkInput,
    gatewayConfig?: Record<string, unknown> | null
  ): Promise<string> {
    const provider = this.providers.get(method)
    if (!provider) {
      throw new BadRequestException(`Gateway chưa được hỗ trợ: ${method}`)
    }
    return provider.createPaymentLink(input, gatewayConfig)
  }
}

