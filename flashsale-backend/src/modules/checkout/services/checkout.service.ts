import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CampaignStatus, PaymentMethod } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { CheckoutRepository } from '../repositories/checkout.repository'
import { CheckoutDto } from '../dto/checkout.dto'
import { PaymentGatewayRegistry } from '@modules/payment/services/payment-gateway.registry'
import { PaymentGatewayConfigService } from '@modules/payment/services/payment-gateway-config.service'
import { StripeConnectService } from '@modules/payment/services/stripe-connect.service'

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name)

  constructor(
    private readonly checkoutRepository: CheckoutRepository,
    private readonly redis: RedisService,
    private readonly paymentGatewayRegistry: PaymentGatewayRegistry,
    private readonly paymentGatewayConfigService: PaymentGatewayConfigService,
    private readonly stripeConnectService: StripeConnectService,
    private readonly configService: ConfigService
  ) {}

  async initiate(userId: string, dto: CheckoutDto) {
    // 1. Validate reservation still HOLDING in Redis (source of truth)
    const resv = await this.redis.getReservation(dto.reservationId)
    if (!resv || resv.status !== 'HOLDING')
      throw new BadRequestException('Giữ chỗ đã hết hạn hoặc không tồn tại')
    if (resv.customerId !== userId)
      throw new ForbiddenException('Không có quyền truy cập giữ chỗ này')

    // 2. Get campaign product for price calculation and validate campaign is still ACTIVE
    const cp = await this.checkoutRepository.findCampaignProduct(
      resv.campaignProductId
    )
    if (!cp) throw new NotFoundException('Sản phẩm không tồn tại')

    if (cp.campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException(
        'Chiến dịch đã kết thúc hoặc bị dừng — không thể thanh toán'
      )
    }

    const amount = Number(cp.salePrice) * parseInt(resv.quantity)
    const shippingAddress = dto.shippingAddress.trim()
    if (!shippingAddress) {
      throw new BadRequestException('Địa chỉ giao hàng không hợp lệ')
    }

    // 3. Idempotency + DB-first shipping persistence in one transaction
    const idempotencyKey = `checkout:${dto.reservationId}`
    const payment =
      await this.checkoutRepository.createOrReusePaymentWithReservationUpdate({
        reservationId: dto.reservationId,
        amount,
        method: dto.paymentMethod,
        idempotencyKey,
        shippingAddress
      })

    const gatewayConfig =
      await this.paymentGatewayConfigService.ensureGatewayEnabled(
        payment.method
      )

    // 4. Keep a Redis fallback copy for recovery scenarios.
    await this.redis.client.set(
      `checkout:addr:${dto.reservationId}`,
      JSON.stringify({
        shippingAddress,
        paymentId: payment.id
      }),
      'EX',
      this.configService.get<number>(
        'timeouts.CHECKOUT_ADDRESS_TTL_SECONDS',
        1200
      )
    )

    // 5. Resolve Stripe Connect params for this merchant
    const connectParams = this.resolveConnectParams(cp, Number(payment.amount))
    const customer = await this.checkoutRepository.findCustomerSummary(userId)

    return {
      paymentUrl: await this.buildPaymentUrl(
        payment.id,
        payment.method,
        Number(payment.amount),
        cp.campaign.name,
        customer,
        dto.clientOrigin,
        gatewayConfig.config as Record<string, unknown> | null,
        connectParams
      ),
      paymentId: payment.id
    }
  }

  /**
   * Lấy destinationAccountId và applicationFeeAmount nếu merchant đã kết nối Stripe.
   * Nếu chưa kết nối → thanh toán vào platform account, không transfer (fallback an toàn).
   */
  private resolveConnectParams(
    cp: Awaited<ReturnType<CheckoutRepository['findCampaignProduct']>>,
    grossAmount: number
  ): { destinationAccountId?: string; applicationFeeAmount?: number } {
    const merchant = cp?.campaign?.merchant
    if (
      !merchant?.stripeAccountId ||
      merchant.stripeAccountStatus !== 'ACTIVE' ||
      !merchant.stripeChargesEnabled
    ) {
      this.logger.warn({
        event: 'stripe_connect_fallback',
        reason: 'merchant not connected or not active',
        status: merchant?.stripeAccountStatus
      })
      return {}
    }

    const rate = cp?.campaign?.commissionRate
      ? Number(cp.campaign.commissionRate)
      : 0
    const fee = this.stripeConnectService.calculateFee(grossAmount, rate)

    return {
      destinationAccountId: merchant.stripeAccountId,
      applicationFeeAmount: fee
    }
  }

  private async buildPaymentUrl(
    paymentId: string,
    method: PaymentMethod,
    amount: number,
    campaignName: string,
    customer: { fullName: string; email: string } | null,
    clientOrigin: string | undefined,
    gatewayConfig?: Record<string, unknown> | null,
    connectParams?: {
      destinationAccountId?: string
      applicationFeeAmount?: number
    }
  ): Promise<string> {
    const clientUrl = this.resolveClientUrl(clientOrigin)

    const returnUrl = `${clientUrl}/payment/return`
    const cancelUrl = `${clientUrl}/payment/cancel`
    return this.paymentGatewayRegistry.createPaymentLink(
      method,
      {
        paymentId,
        amount,
        description: `Flash Sale - ${campaignName}`,
        returnUrl,
        cancelUrl,
        customerEmail: customer?.email,
        customerName: customer?.fullName,
        ...connectParams
      },
      gatewayConfig
    )
  }

  /**
   * Chỉ chấp nhận redirect về các origin frontend đã cấu hình để tránh open redirect.
   */
  private resolveClientUrl(clientOrigin?: string): string {
    const serverUrl = this.configService.get<string>(
      'application.CLIENT_URL_SERVER',
      ''
    )
    const localUrl = this.configService.get<string>(
      'application.CLIENT_URL_LOCAL',
      ''
    )

    const allowList = [serverUrl, localUrl]
      .map(url => url?.trim())
      .filter((url): url is string => Boolean(url))

    if (clientOrigin && allowList.includes(clientOrigin.trim())) {
      return clientOrigin.trim()
    }

    return serverUrl || localUrl || ''
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
