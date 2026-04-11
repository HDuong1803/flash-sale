import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

export type StripeAccountStatus =
  | 'NOT_CONNECTED'
  | 'PENDING'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'DISABLED'

interface StripeAccountResponse {
  id: string
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted: boolean
  requirements?: {
    disabled_reason?: string | null
    currently_due?: string[]
  }
}

interface AccountLinkResponse {
  url: string
  expires_at: number
  object: string
}

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name)
  private readonly baseUrl = 'https://api.stripe.com/v1'

  constructor(private readonly configService: ConfigService) {}

  private get secretKey(): string {
    const key = this.configService.get<string>('stripe.STRIPE_SECRET_KEY', '')
    if (!key) throw new BadRequestException('Thiếu STRIPE_SECRET_KEY')
    return key
  }

  private authHeader() {
    return { Authorization: `Bearer ${this.secretKey}` }
  }

  /**
   * Tạo Stripe Express Connected Account cho merchant.
   * Chỉ tạo 1 lần — idempotent với stripeAccountId đã lưu.
   */
  async createConnectedAccount(params: {
    email: string
    businessName: string
    country?: string
  }): Promise<string> {
    const form = new URLSearchParams()
    form.append('type', 'express')
    form.append('country', params.country ?? 'VN')
    form.append('email', params.email)
    form.append('capabilities[card_payments][requested]', 'true')
    form.append('capabilities[transfers][requested]', 'true')
    form.append('business_profile[name]', params.businessName)
    form.append('settings[payouts][schedule][interval]', 'manual')

    const res = await axios.post<StripeAccountResponse>(
      `${this.baseUrl}/accounts`,
      form.toString(),
      {
        headers: {
          ...this.authHeader(),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15_000
      }
    )

    this.logger.log({
      event: 'stripe_connect_account_created',
      accountId: res.data.id,
      email: params.email
    })

    return res.data.id
  }

  /**
   * Tạo Account Link cho merchant hoàn tất onboarding trên Stripe.
   * URL có hiệu lực 5 phút — tạo mới khi merchant quay lại.
   */
  async createAccountLink(params: {
    accountId: string
    refreshUrl: string
    returnUrl: string
  }): Promise<string> {
    const form = new URLSearchParams()
    form.append('account', params.accountId)
    form.append('refresh_url', params.refreshUrl)
    form.append('return_url', params.returnUrl)
    form.append('type', 'account_onboarding')

    const res = await axios.post<AccountLinkResponse>(
      `${this.baseUrl}/account_links`,
      form.toString(),
      {
        headers: {
          ...this.authHeader(),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15_000
      }
    )

    return res.data.url
  }

  /**
   * Tạo Login Link để merchant vào Stripe Express Dashboard.
   */
  async createLoginLink(accountId: string): Promise<string> {
    const res = await axios.post<{ url: string }>(
      `${this.baseUrl}/accounts/${accountId}/login_links`,
      '',
      {
        headers: {
          ...this.authHeader(),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15_000
      }
    )
    return res.data.url
  }

  /**
   * Lấy thông tin account từ Stripe để sync trạng thái.
   */
  async retrieveAccount(accountId: string): Promise<StripeAccountResponse> {
    const res = await axios.get<StripeAccountResponse>(
      `${this.baseUrl}/accounts/${accountId}`,
      {
        headers: this.authHeader(),
        timeout: 15_000
      }
    )
    return res.data
  }

  /**
   * Xác định StripeAccountStatus dựa trên dữ liệu từ Stripe API.
   */
  resolveAccountStatus(account: StripeAccountResponse): StripeAccountStatus {
    if (!account.details_submitted) return 'PENDING'
    if (account.requirements?.disabled_reason) return 'RESTRICTED'
    if (account.charges_enabled && account.payouts_enabled) return 'ACTIVE'
    return 'RESTRICTED'
  }

  /**
   * Tính application_fee_amount (VND) để trừ vào transfer.
   * Stripe yêu cầu đơn vị nhỏ nhất — với VND (zero-decimal) giá trị nguyên.
   */
  calculateFee(grossAmountVnd: number, commissionRate: number): number {
    return Math.round(grossAmountVnd * commissionRate)
  }
}
