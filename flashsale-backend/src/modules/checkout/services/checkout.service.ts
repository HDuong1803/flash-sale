import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentMethod } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { CheckoutRepository } from '../repositories/checkout.repository'
import { CheckoutDto } from '../dto/checkout.dto'
import { PaymentGatewayRegistry } from '@modules/payment/services/payment-gateway.registry'
import { PaymentGatewayConfigService } from '@modules/payment/services/payment-gateway-config.service'

@Injectable()
export class CheckoutService {
  constructor(
    private readonly checkoutRepository: CheckoutRepository,
    private readonly redis: RedisService,
    private readonly paymentGatewayRegistry: PaymentGatewayRegistry,
    private readonly paymentGatewayConfigService: PaymentGatewayConfigService,
    private readonly configService: ConfigService
  ) {}

  async initiate(userId: string, dto: CheckoutDto) {
    // 1. Validate reservation still HOLDING in Redis (source of truth)
    const resv = await this.redis.getReservation(dto.reservationId)
    if (!resv || resv.status !== 'HOLDING')
      throw new BadRequestException('Giữ chỗ đã hết hạn hoặc không tồn tại')
    if (resv.customerId !== userId)
      throw new ForbiddenException('Không có quyền truy cập giữ chỗ này')

    // 2. Get campaign product for price calculation
    const cp = await this.checkoutRepository.findCampaignProduct(
      resv.campaignProductId
    )
    if (!cp) throw new NotFoundException('Sản phẩm không tồn tại')

    const amount = Number(cp.salePrice) * parseInt(resv.quantity)

    // 3. Idempotency — return existing payment if already created for this reservation
    const idempotencyKey = `checkout:${dto.reservationId}`
    const existingPayment =
      await this.checkoutRepository.findPaymentByIdempotencyKey(idempotencyKey)
    if (existingPayment) {
      const gatewayConfig =
        await this.paymentGatewayConfigService.ensureGatewayEnabled(
          existingPayment.method
        )
      return {
        paymentUrl: await this.buildPaymentUrl(
          existingPayment.id,
          existingPayment.method,
          Number(existingPayment.amount),
          gatewayConfig.config as Record<string, unknown> | null
        ),
        paymentId: existingPayment.id
      }
    }

    // 4. Create Payment (PENDING)
    const payment = await this.checkoutRepository.createPayment({
      reservationId: dto.reservationId,
      amount,
      method: dto.paymentMethod,
      idempotencyKey
    })

    // 5. Store shipping address in Redis for Saga to use during webhook
    await this.redis.client.set(
      `checkout:addr:${dto.reservationId}`,
      JSON.stringify({
        shippingAddress: dto.shippingAddress,
        paymentId: payment.id
      }),
      'EX',
      this.configService.get<number>(
        'timeouts.CHECKOUT_ADDRESS_TTL_SECONDS',
        1200
      )
    )

    return {
      paymentUrl: await this.buildPaymentUrl(
        payment.id,
        dto.paymentMethod,
        amount,
        (await this.paymentGatewayConfigService.ensureGatewayEnabled(dto.paymentMethod))
          .config as Record<string, unknown> | null
      ),
      paymentId: payment.id
    }
  }

  private async buildPaymentUrl(
    paymentId: string,
    method: PaymentMethod,
    amount: number,
    gatewayConfig?: Record<string, unknown> | null
  ): Promise<string> {
    const frontendUrl = this.configService.get<string>(
      'frontend.FRONTEND_URL',
      ''
    )
    const returnUrl = `${frontendUrl}/payment/return`
    const cancelUrl = `${frontendUrl}/payment/cancel`
    return this.paymentGatewayRegistry.createPaymentLink(
      method,
      {
        paymentId,
        amount,
        description: `FlashSale ${paymentId}`,
        returnUrl,
        cancelUrl
      },
      gatewayConfig
    )
  }

  async getPaymentMethods() {
    const gateways = await this.paymentGatewayConfigService.listEnabled()
    return gateways.map(g => ({
      method: g.gateway,
      displayName: g.displayName,
      isDefault: g.isDefault
    }))
  }
}
