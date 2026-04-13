import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

/** Extract human-readable message from Stripe error response */
function stripeErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: { message?: string; code?: string; type?: string } }
      | undefined
    const msg = data?.error?.message
    const code = data?.error?.code ?? data?.error?.type
    return code ? `${msg ?? err.message} (${code})` : msg ?? err.message
  }
  return err instanceof Error ? err.message : String(err)
}

/**
 * Các trạng thái có thể có của một Stripe Connected Account.
 *
 * NOT_CONNECTED  — merchant chưa bắt đầu hoặc chưa có stripeAccountId trong DB
 * PENDING        — account đã tạo nhưng merchant chưa submit đầy đủ thông tin
 * ACTIVE         — charges + payouts enabled, merchant có thể nhận tiền
 * RESTRICTED     — đã submit nhưng bị Stripe flag (thiếu document, fraud check, v.v.)
 * DISABLED       — bị Stripe vô hiệu hoá hoàn toàn (hiếm gặp)
 */
export type StripeAccountStatus =
  | 'NOT_CONNECTED'
  | 'PENDING'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'DISABLED'

/** Subset các field cần thiết từ GET /v1/accounts/:id */
interface StripeAccountResponse {
  id: string
  charges_enabled: boolean
  payouts_enabled: boolean
  /** true khi merchant đã submit form onboarding ít nhất một lần */
  details_submitted: boolean
  requirements?: {
    /** Lý do account bị hạn chế: "requirements.past_due", "listed", v.v. */
    disabled_reason?: string | null
    /** Danh sách field Stripe đang yêu cầu bổ sung */
    currently_due?: string[]
  }
}

/** Response từ POST /v1/account_links */
interface AccountLinkResponse {
  url: string
  /** Unix timestamp — link hết hạn sau ~5 phút */
  expires_at: number
  object: string
}

/**
 * StripeConnectService — quản lý toàn bộ vòng đời Stripe Express account.
 *
 * Trách nhiệm:
 *  - Tạo Stripe Express account cho merchant (idempotent — chỉ tạo 1 lần)
 *  - Tạo Account Link để merchant hoàn tất KYC trên Stripe
 *  - Tạo Login Link để merchant vào Stripe Express Dashboard
 *  - Retrieve account và resolve trạng thái thành StripeAccountStatus
 *
 * Service này CHỈ giao tiếp với Stripe API, không touch DB.
 * DB updates được thực hiện bởi MerchantConnectService (layer trên).
 */
@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name)
  private readonly baseUrl = 'https://api.stripe.com/v1'

  constructor(private readonly configService: ConfigService) {}

  /**
   * Lấy Stripe secret key từ config, throw nếu chưa cấu hình.
   * Dùng getter để luôn đọc giá trị mới nhất (không cache tại constructor).
   */
  private get secretKey(): string {
    const key = this.configService.get<string>('stripe.STRIPE_SECRET_KEY', '')
    if (!key) throw new BadRequestException('Thiếu STRIPE_SECRET_KEY')
    return key
  }

  /** Helper tạo Authorization header dùng chung cho mọi Stripe API call. */
  private authHeader() {
    return { Authorization: `Bearer ${this.secretKey}` }
  }

  /**
   * Tạo Stripe Express Connected Account cho merchant.
   *
   * WHY Express (không phải Standard/Custom):
   *   - Stripe host toàn bộ onboarding UI — platform không cần build form KYC
   *   - Merchant có Stripe Express Dashboard để xem payout
   *   - Platform có quyền kiểm soát payout schedule
   *
   * HOW idempotency:
   *   Caller (MerchantConnectService) chỉ gọi hàm này khi stripeAccountId chưa
   *   tồn tại trong DB → đảm bảo mỗi merchant chỉ có 1 account.
   *
   * @param params.email         Email merchant (hiển thị trong Stripe Dashboard)
   * @param params.businessName  Tên doanh nghiệp cho business_profile
   * @param params.country       ISO 3166-1 alpha-2, default "VN"
   * @returns                    Stripe account ID (acct_xxx)
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
    // Yêu cầu 2 capabilities cần thiết để nhận Destination Charges:
    //   card_payments — xử lý card transaction qua platform
    //   transfers     — nhận transfer từ platform account
    form.append('capabilities[card_payments][requested]', 'true')
    form.append('capabilities[transfers][requested]', 'true')
    form.append('business_profile[name]', params.businessName)
    // Không ép payout schedule = manual.
    // Với Destination Charges, merchant nên nhận payout theo cycle mặc định của Stripe
    // (thường T+2 tại nhiều thị trường) để tránh phải vận hành manual payout nội bộ.

    let res: Awaited<ReturnType<typeof axios.post<StripeAccountResponse>>>
    try {
      res = await axios.post<StripeAccountResponse>(
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
    } catch (err: unknown) {
      this.logger.error({
        event: 'stripe_create_account_error',
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
        error: axios.isAxiosError(err) ? err.response?.data : String(err),
        email: params.email,
        country: params.country ?? 'VN'
      })
      throw new BadRequestException(
        `Không thể tạo tài khoản Stripe Connect: ${stripeErrorMessage(err)}`
      )
    }

    this.logger.log({
      event: 'stripe_connect_account_created',
      accountId: res.data.id,
      email: params.email
    })

    return res.data.id
  }

  /**
   * Tạo Account Link — URL một lần để merchant hoàn tất KYC trên Stripe.
   *
   * WHY tạo mới mỗi lần:
   *   Account Link có TTL ~5 phút và chỉ dùng được một lần.
   *   Khi merchant quay lại (refresh/return URL), cần tạo link mới.
   *
   * HOW hai loại URL:
   *   - `return_url`: merchant hoàn tất form → Stripe redirect về đây
   *   - `refresh_url`: link hết hạn hoặc user back → Stripe redirect để tạo link mới
   *
   * @param params.accountId   Stripe account ID (acct_xxx)
   * @param params.refreshUrl  URL khi link hết hạn (thường là trang settings với ?stripe=refresh)
   * @param params.returnUrl   URL sau khi merchant submit (thường là trang settings với ?stripe=return)
   * @returns                  Onboarding URL để redirect merchant
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
    // account_onboarding: luồng KYC lần đầu (hoặc bổ sung thêm info)
    form.append('type', 'account_onboarding')

    let res: Awaited<ReturnType<typeof axios.post<AccountLinkResponse>>>
    try {
      res = await axios.post<AccountLinkResponse>(
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
    } catch (err: unknown) {
      this.logger.error({
        event: 'stripe_account_link_error',
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
        error: axios.isAxiosError(err) ? err.response?.data : String(err),
        accountId: params.accountId
      })
      throw new BadRequestException(
        `Không thể tạo Stripe onboarding link: ${stripeErrorMessage(err)}`
      )
    }

    return res.data.url
  }

  /**
   * Tạo Login Link để merchant đăng nhập Stripe Express Dashboard.
   *
   * WHY cần Login Link (không phải URL cố định):
   *   Stripe Express Dashboard không có URL public cố định.
   *   Mỗi login link là signed URL ngắn hạn, chỉ dùng một lần.
   *   Chỉ tạo được khi account đã ACTIVE (details_submitted = true).
   *
   * @param accountId  Stripe account ID (acct_xxx)
   * @returns          URL Stripe Express Dashboard (ngắn hạn)
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
   * Lấy thông tin đầy đủ của một Connected Account từ Stripe API.
   * Dùng để sync trạng thái sau khi merchant hoàn tất onboarding.
   *
   * @param accountId  Stripe account ID (acct_xxx)
   * @returns          Account data với charges_enabled, payouts_enabled, requirements
   */
  async retrieveAccount(accountId: string): Promise<StripeAccountResponse> {
    let res: Awaited<ReturnType<typeof axios.get<StripeAccountResponse>>>
    try {
      res = await axios.get<StripeAccountResponse>(
        `${this.baseUrl}/accounts/${accountId}`,
        {
          headers: this.authHeader(),
          timeout: 15_000
        }
      )
    } catch (err: unknown) {
      this.logger.error({
        event: 'stripe_retrieve_account_error',
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
        error: axios.isAxiosError(err) ? err.response?.data : String(err),
        accountId
      })
      throw new BadRequestException(
        `Không thể lấy thông tin Stripe account: ${stripeErrorMessage(err)}`
      )
    }
    return res.data
  }

  /**
   * Xác định StripeAccountStatus dựa trên dữ liệu Stripe API trả về.
   *
   * Logic state machine (theo thứ tự ưu tiên):
   *
   *  1. `!details_submitted`               → PENDING
   *     Merchant chưa hoàn tất form KYC lần đầu, cần tiếp tục onboarding.
   *
   *  2. `requirements.disabled_reason` thuộc nhóm reject/listed → DISABLED
   *     Account bị Stripe vô hiệu hoá cứng, merchant thường phải liên hệ support.
   *
   *  3. `requirements.disabled_reason` còn lại → RESTRICTED
   *     Stripe yêu cầu bổ sung hồ sơ hoặc xử lý issue vận hành.
   *
   *  4. `charges_enabled && payouts_enabled` → ACTIVE
   *     Account đầy đủ năng lực: nhận tiền và rút tiền được.
   *
   *  5. Còn lại                            → RESTRICTED
   *     Đã submit nhưng một trong hai capability chưa được enable.
   *
   * @param account  Dữ liệu account từ retrieveAccount()
   * @returns        StripeAccountStatus tương ứng
   */
  resolveAccountStatus(account: StripeAccountResponse): StripeAccountStatus {
    // Bước 1: chưa submit → chắc chắn PENDING
    if (!account.details_submitted) return 'PENDING'

    // Bước 2: phân loại disabled_reason thành DISABLED hoặc RESTRICTED.
    const disabledReason = account.requirements?.disabled_reason
    if (disabledReason) {
      // Nhóm reason này thường là cấm/hạn chế cứng từ Stripe.
      if (
        disabledReason === 'listed' ||
        disabledReason.startsWith('rejected.')
      ) {
        return 'DISABLED'
      }

      // Các reason còn lại (ví dụ requirements.past_due) thường có thể khắc phục.
      return 'RESTRICTED'
    }

    // Bước 3: đủ điều kiện hoạt động hoàn toàn → ACTIVE
    if (account.charges_enabled && account.payouts_enabled) return 'ACTIVE'

    // Bước 4: submitted nhưng capability chưa đủ → vẫn RESTRICTED
    return 'RESTRICTED'
  }

  /**
   * Tính application_fee_amount (phần platform giữ lại) từ tổng tiền và tỷ lệ hoa hồng.
   *
   * WHY zero-decimal:
   *   VND là zero-decimal currency theo Stripe — giá trị unit_amount = số VND nguyên.
   *   Không nhân x100 như USD (cents).
   *
   * @param grossAmountVnd  Tổng giá trị giao dịch (VND)
   * @param commissionRate  Tỷ lệ hoa hồng platform (0–1, ví dụ 0.05 = 5%)
   * @returns               Số VND platform giữ lại (rounded integer)
   */
  calculateFee(grossAmountVnd: number, commissionRate: number): number {
    return Math.round(grossAmountVnd * commissionRate)
  }
}
