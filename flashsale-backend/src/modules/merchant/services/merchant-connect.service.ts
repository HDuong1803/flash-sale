import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MerchantRepository } from '../repositories/merchant.repository'
import { StripeConnectService } from '@modules/payment/services/stripe-connect.service'

@Injectable()
export class MerchantConnectService {
  private readonly logger = new Logger(MerchantConnectService.name)

  constructor(
    private readonly merchantRepository: MerchantRepository,
    private readonly stripeConnectService: StripeConnectService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Bước 1: Khởi tạo hoặc tiếp tục onboarding Stripe Connect.
   * - Nếu chưa có account → tạo mới Stripe Express account
   * - Tạo Account Link (URL có hiệu lực 5 phút)
   * - Trả về onboardingUrl để frontend redirect
   */
  async initiateOnboarding(userId: string): Promise<{ onboardingUrl: string }> {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')
    if (merchant.kycStatus !== 'APPROVED') {
      throw new BadRequestException(
        'Tài khoản merchant chưa được duyệt, không thể kết nối Stripe'
      )
    }

    let stripeAccountId = merchant.stripeAccountId

    // Tạo mới nếu chưa có
    if (!stripeAccountId) {
      const merchantWithUser = merchant as typeof merchant & {
        user?: { email: string }
      }
      const email = merchantWithUser.user
        ? (merchantWithUser as { user: { email: string } }).user.email
        : userId

      stripeAccountId = await this.stripeConnectService.createConnectedAccount({
        email,
        businessName: merchant.businessName
      })

      await this.merchantRepository.updateStripeConnect(merchant.id, {
        stripeAccountId,
        stripeAccountStatus: 'PENDING'
      })

      this.logger.log({
        event: 'stripe_connect_account_initiated',
        merchantId: merchant.id,
        stripeAccountId
      })
    }

    const frontendUrl = this.configService.get<string>(
      'frontend.FRONTEND_URL',
      ''
    )
    const onboardingUrl = await this.stripeConnectService.createAccountLink({
      accountId: stripeAccountId,
      refreshUrl: `${frontendUrl}/merchant/settings?stripe=refresh`,
      returnUrl: `${frontendUrl}/merchant/settings?stripe=return`
    })

    return { onboardingUrl }
  }

  /**
   * Bước 2: Merchant quay về sau khi hoàn tất/bỏ qua onboarding Stripe.
   * Sync trạng thái từ Stripe API → cập nhật DB.
   */
  async syncConnectStatus(userId: string): Promise<{
    status: string
    chargesEnabled: boolean
    payoutsEnabled: boolean
    onboardingUrl?: string
  }> {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')

    if (!merchant.stripeAccountId) {
      return {
        status: 'NOT_CONNECTED',
        chargesEnabled: false,
        payoutsEnabled: false
      }
    }

    const account = await this.stripeConnectService.retrieveAccount(
      merchant.stripeAccountId
    )
    const newStatus = this.stripeConnectService.resolveAccountStatus(account)

    await this.merchantRepository.updateStripeConnect(merchant.id, {
      stripeAccountStatus: newStatus,
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      stripeConnectedAt:
        newStatus === 'ACTIVE' && !merchant.stripeConnectedAt
          ? new Date()
          : undefined
    })

    // Nếu vẫn PENDING → trả onboardingUrl mới để merchant tiếp tục
    let onboardingUrl: string | undefined
    if (newStatus === 'PENDING' || newStatus === 'RESTRICTED') {
      const frontendUrl = this.configService.get<string>(
        'frontend.FRONTEND_URL',
        ''
      )
      onboardingUrl = await this.stripeConnectService.createAccountLink({
        accountId: merchant.stripeAccountId,
        refreshUrl: `${frontendUrl}/merchant/settings?stripe=refresh`,
        returnUrl: `${frontendUrl}/merchant/settings?stripe=return`
      })
    }

    return {
      status: newStatus,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      onboardingUrl
    }
  }

  /**
   * Lấy trạng thái kết nối Stripe hiện tại (không gọi Stripe API).
   */
  async getConnectStatus(userId: string) {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')

    const status = await this.merchantRepository.findStripeConnectStatus(
      merchant.id
    )
    return {
      status: status?.stripeAccountStatus ?? 'NOT_CONNECTED',
      chargesEnabled: status?.stripeChargesEnabled ?? false,
      payoutsEnabled: status?.stripePayoutsEnabled ?? false,
      connectedAt: status?.stripeConnectedAt ?? null
    }
  }

  /**
   * Tạo Login Link để merchant vào Stripe Express Dashboard quản lý payout.
   */
  async getDashboardLink(userId: string): Promise<{ url: string }> {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')

    if (
      !merchant.stripeAccountId ||
      merchant.stripeAccountStatus !== 'ACTIVE'
    ) {
      throw new BadRequestException('Tài khoản Stripe chưa hoàn tất kết nối')
    }

    const url = await this.stripeConnectService.createLoginLink(
      merchant.stripeAccountId
    )
    return { url }
  }
}
