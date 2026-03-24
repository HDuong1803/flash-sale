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
import { SepayService } from '@modules/payment/services/sepay.service'

@Injectable()
export class CheckoutService {
  constructor(
    private readonly checkoutRepository: CheckoutRepository,
    private readonly redis: RedisService,
    private readonly sepayService: SepayService,
    private readonly configService: ConfigService
  ) {}

  async initiate(userId: string, dto: CheckoutDto) {
    // 1. Validate reservation still HOLDING in Redis (source of truth)
    const resv = await this.redis.getReservation(dto.reservationId)
    if (!resv || resv.status !== 'HOLDING')
      throw new BadRequestException('Reservation đã hết hạn hoặc không tồn tại')
    if (resv.customerId !== userId)
      throw new ForbiddenException('Không có quyền truy cập reservation này')

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
      return {
        paymentUrl: await this.buildPaymentUrl(
          existingPayment.id,
          dto.paymentMethod,
          Number(existingPayment.amount)
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
      this.configService.get<number>('timeouts.CHECKOUT_ADDRESS_TTL_SECONDS', 1200)
    )

    return {
      paymentUrl: await this.buildPaymentUrl(
        payment.id,
        dto.paymentMethod,
        amount
      ),
      paymentId: payment.id
    }
  }

  private async buildPaymentUrl(
    paymentId: string,
    method: string,
    amount: number
  ): Promise<string> {
    const frontendUrl = this.configService.get<string>('frontend.FRONTEND_URL', '')
    const returnUrl = `${frontendUrl}/payment/return`
    const cancelUrl = `${frontendUrl}/payment/cancel`

    if (method === PaymentMethod.SEPAY) {
      const result = await this.sepayService.createPaymentLink({
        paymentId,
        amount,
        description: `FlashSale ${paymentId}`,
        returnUrl,
        cancelUrl
      })
      return result.paymentUrl
    }

    return `${returnUrl}?paymentId=${paymentId}&method=${method}`
  }
}
