import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MerchantRepository } from '../repositories/merchant.repository'
import {
  StripeAccountStatus,
  StripeConnectService
} from '@modules/payment/services/stripe-connect.service'
import { RedisService } from '@infrastructure/redis/redis.service'

export interface MerchantStripeConnectStatusResponse {
  status: StripeAccountStatus
  chargesEnabled: boolean
  payoutsEnabled: boolean
  connectedAt?: Date | null
  onboardingUrl?: string
}

/**
 * MerchantConnectService — orchestrate toàn bộ luồng Stripe Connect onboarding.
 *
 * Layer này là trung gian giữa Controller và StripeConnectService:
 *  - Đọc/ghi DB qua MerchantRepository
 *  - Gọi Stripe API qua StripeConnectService
 *  - Áp dụng business rules (KYC check, idempotency, URL generation)
 *
 * Luồng chính (happy path):
 *  1. initiateOnboarding()  → tạo/lấy Stripe account → tạo Account Link → redirect
 *  2. [Merchant hoàn tất form trên Stripe]
 *  3. syncConnectStatus()   → retrieve account từ Stripe → cập nhật DB → trả kết quả
 */
@Injectable()
export class MerchantConnectService {
  private readonly logger = new Logger(MerchantConnectService.name)
  private readonly knownStatuses = new Set<StripeAccountStatus>([
    'NOT_CONNECTED',
    'PENDING',
    'ACTIVE',
    'RESTRICTED',
    'DISABLED'
  ])

  constructor(
    private readonly merchantRepository: MerchantRepository,
    private readonly stripeConnectService: StripeConnectService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService
  ) {}

  private normalizeStatus(value?: string | null): StripeAccountStatus {
    if (!value) return 'NOT_CONNECTED'
    return this.knownStatuses.has(value as StripeAccountStatus)
      ? (value as StripeAccountStatus)
      : 'RESTRICTED'
  }

  /**
   * Bước 1: Khởi tạo hoặc tiếp tục onboarding Stripe Connect.
   *
   * WHY idempotent create:
   *   Merchant có thể click "Kết nối Stripe" nhiều lần (browser back, refresh).
   *   Nếu đã có stripeAccountId trong DB → không tạo mới, chỉ tạo Account Link mới.
   *   Account Link cũ đã hết hạn (5 phút) → tạo mới mỗi lần là đúng.
   *
   * HOW email fallback:
   *   Dùng email thật từ merchant.user để Stripe gửi notification chính xác.
   *   Nếu thiếu email (data bất thường), fallback sang alias hợp lệ để tránh reject format.
   *
   * @param userId  ID của user đang đăng nhập (lấy từ JWT)
   * @returns       { onboardingUrl } để frontend window.location.assign()
   */
  async initiateOnboarding(userId: string): Promise<{ onboardingUrl: string }> {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')

    // Guard: chỉ cho phép kết nối Stripe sau khi merchant đã được admin duyệt
    if (merchant.kycStatus !== 'APPROVED') {
      throw new BadRequestException(
        'Tài khoản merchant chưa được duyệt, không thể kết nối Stripe'
      )
    }

    let stripeAccountId = merchant.stripeAccountId

    // ── Idempotent account creation ───────────────────────────────────────────
    // Tạo mới Stripe Express account chỉ khi chưa có trong DB.
    // Nếu đã có (PENDING/RESTRICTED) → bỏ qua, tạo Account Link mới là đủ.
    if (!stripeAccountId) {
      // Guard cạnh tranh: cùng merchant bấm nhiều tab có thể đua nhau tạo account.
      // Dùng lock ngắn hạn để chỉ 1 request được quyền create account trên Stripe.
      const lockKey = `stripe:connect:init:${merchant.id}`
      const lockAcquired = await this.redis.acquireLock(lockKey, 30_000)

      if (!lockAcquired) {
        // Request khác đang xử lý create account.
        // Đọc lại DB để lấy account vừa được tạo, tránh throw sai khi user click nhanh.
        const latestMerchant = await this.merchantRepository.findByUserId(
          userId
        )
        if (!latestMerchant)
          throw new NotFoundException('Không tìm thấy thông tin merchant')

        if (!latestMerchant.stripeAccountId) {
          throw new BadRequestException(
            'Yêu cầu kết nối Stripe đang được xử lý, vui lòng thử lại sau vài giây'
          )
        }
        stripeAccountId = latestMerchant.stripeAccountId
      } else {
        // Không release lock thủ công để tránh edge-case unlock nhầm khi TTL đã hết
        // và lock được request khác acquire lại. Lock sẽ tự hết hạn sau 30 giây.
        const latestMerchant = await this.merchantRepository.findByUserId(
          userId
        )
        if (!latestMerchant)
          throw new NotFoundException('Không tìm thấy thông tin merchant')

        if (latestMerchant.stripeAccountId) {
          stripeAccountId = latestMerchant.stripeAccountId
        } else {
          // Repository đã include relation `user`, dùng email thật để Stripe gửi thông báo.
          // Fallback sang alias hợp lệ để không bao giờ gửi userId thô (không phải email).
          const email =
            latestMerchant.user?.email?.trim() ||
            `merchant+${latestMerchant.id}@placeholder.local`

          stripeAccountId =
            await this.stripeConnectService.createConnectedAccount({
              email,
              businessName: latestMerchant.businessName
            })

          // Lưu stripeAccountId và set status PENDING ngay lập tức
          await this.merchantRepository.updateStripeConnect(latestMerchant.id, {
            stripeAccountId,
            stripeAccountStatus: 'PENDING'
          })

          this.logger.log({
            event: 'stripe_connect_account_initiated',
            merchantId: latestMerchant.id,
            stripeAccountId
          })
        }
      }
    }

    // ── Tạo Account Link (luôn tạo mới — TTL 5 phút) ─────────────────────────
    const clientUrl = this.configService.get<string>(
      'application.CLIENT_URL_SERVER',
      ''
    )
    const onboardingUrl = await this.stripeConnectService.createAccountLink({
      accountId: stripeAccountId,
      // refresh_url: khi link hết hạn, Stripe redirect về đây → frontend gọi lại initiate
      refreshUrl: `${clientUrl}/settings?stripe=refresh`,
      // return_url: sau khi merchant submit form KYC → Stripe redirect về đây → frontend gọi sync
      returnUrl: `${clientUrl}/settings?stripe=return`
    })

    return { onboardingUrl }
  }

  /**
   * Bước 2: Sync trạng thái từ Stripe về DB sau khi merchant quay lại.
   *
   * Được gọi khi frontend phát hiện URL param `?stripe=return` hoặc `?stripe=refresh`.
   *
   * WHY gọi Stripe API thay vì dùng webhook:
   *   Webhook có thể đến trễ hoặc thất bại. Pull-on-demand sau redirect đảm bảo
   *   UI hiển thị trạng thái chính xác ngay lập tức cho merchant.
   *   Webhook vẫn là source of truth cho hệ thống — đây chỉ là UX shortcut.
   *
   * HOW fallback onboardingUrl:
   *   Nếu sau sync status vẫn là PENDING hoặc RESTRICTED → merchant cần tiếp tục.
   *   Trả kèm onboardingUrl mới để frontend có thể hiển thị button "Tiếp tục" ngay.
   *
   * @param userId  ID của user đang đăng nhập
   * @returns       Trạng thái mới + optional onboardingUrl nếu cần tiếp tục
   */
  async syncConnectStatus(
    userId: string
  ): Promise<MerchantStripeConnectStatusResponse> {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')

    // Chưa bắt đầu onboarding → trả NOT_CONNECTED, không gọi Stripe
    if (!merchant.stripeAccountId) {
      return {
        status: 'NOT_CONNECTED',
        chargesEnabled: false,
        payoutsEnabled: false
      }
    }

    // Retrieve account từ Stripe để có trạng thái mới nhất
    const account = await this.stripeConnectService.retrieveAccount(
      merchant.stripeAccountId
    )
    const newStatus = this.stripeConnectService.resolveAccountStatus(account)

    // Cập nhật DB với trạng thái mới từ Stripe
    await this.merchantRepository.updateStripeConnect(merchant.id, {
      stripeAccountStatus: newStatus,
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      // Chỉ set connectedAt lần đầu tiên status chuyển sang ACTIVE
      stripeConnectedAt:
        newStatus === 'ACTIVE' && !merchant.stripeConnectedAt
          ? new Date()
          : undefined
    })

    // ── Fallback onboarding URL cho PENDING/RESTRICTED ────────────────────────
    // Nếu merchant vẫn chưa hoàn tất → tạo Account Link mới để họ tiếp tục
    // (Account Link cũ đã hết hạn sau 5 phút hoặc sau khi dùng)
    let onboardingUrl: string | undefined
    if (newStatus === 'PENDING' || newStatus === 'RESTRICTED') {
      const clientUrl = this.configService.get<string>(
        'application.CLIENT_URL_SERVER',
        ''
      )
      onboardingUrl = await this.stripeConnectService.createAccountLink({
        accountId: merchant.stripeAccountId,
        refreshUrl: `${clientUrl}/settings?stripe=refresh`,
        returnUrl: `${clientUrl}/settings?stripe=return`
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
   * Lấy trạng thái kết nối Stripe hiện tại từ DB (không gọi Stripe API).
   *
   * WHY không gọi Stripe API:
   *   Đây là "read" thông thường — chỉ cần dữ liệu đã sync trong DB.
   *   Gọi Stripe API mỗi lần load trang sẽ tốn quota và làm chậm response.
   *   Chỉ sync khi merchant thực sự quay về từ Stripe (syncConnectStatus).
   *
   * @param userId  ID của user đang đăng nhập
   * @returns       Trạng thái Stripe Connect từ DB
   */
  async getConnectStatus(
    userId: string
  ): Promise<MerchantStripeConnectStatusResponse> {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')

    const status = await this.merchantRepository.findStripeConnectStatus(
      merchant.id
    )
    return {
      status: this.normalizeStatus(status?.stripeAccountStatus),
      chargesEnabled: status?.stripeChargesEnabled ?? false,
      payoutsEnabled: status?.stripePayoutsEnabled ?? false,
      connectedAt: status?.stripeConnectedAt ?? null
    }
  }

  /**
   * Tạo Login Link để merchant vào Stripe Express Dashboard.
   *
   * WHY cần kiểm tra ACTIVE trước:
   *   Stripe chỉ tạo được Login Link cho account đã hoàn toàn ACTIVE.
   *   Nếu gọi với PENDING account → Stripe trả lỗi 400 "account not ready".
   *
   * @param userId  ID của user đang đăng nhập
   * @returns       { url } — Stripe Express Dashboard URL (ngắn hạn, một lần dùng)
   */
  async getDashboardLink(userId: string): Promise<{ url: string }> {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')

    // Guard: chỉ merchant ACTIVE mới có thể vào Dashboard
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
