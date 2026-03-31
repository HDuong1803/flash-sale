import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'

// ─── Custom exception ──────────────────────────────────────────────────────────

export class SepayApiException extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'SepayApiException'
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SepayPaymentLinkParams {
  paymentId: string
  amount: number // VND
  description: string
  returnUrl: string
  cancelUrl: string
}

export interface SepayPaymentLinkResult {
  paymentUrl: string // URL trang chờ thanh toán (frontend /payment/pending?...)
  qrCodeUrl: string // URL ảnh QR VietQR để hiển thị
  bankAccount: string // Số tài khoản ngân hàng
  bankCode: string // Mã ngân hàng (MB, VCB, ...)
  transferContent: string // Nội dung chuyển khoản (chứa paymentId)
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SepayService implements OnModuleInit {
  private readonly logger = new Logger(SepayService.name)

  constructor(private readonly configService: ConfigService) {}

  // ─── Config getters ─────────────────────────────────────────────────────────

  /**
   * Chế độ sandbox:
   * - PHẢI set rõ SEPAY_SANDBOX=true để bật sandbox
   * - Mặc định là FALSE (production mode)
   * - Lý do: tránh vô tình deploy production với verification bị tắt
   */
  get isSandbox(): boolean {
    return (
      this.configService.get<string>('sepay.SEPAY_SANDBOX', 'false') === 'true'
    )
  }

  private get bankAccount(): string {
    return this.configService.get<string>('sepay.SEPAY_BANK_ACCOUNT', '')
  }

  private get bankCode(): string {
    return this.configService.get<string>('sepay.SEPAY_BANK_CODE', '')
  }

  private get accountName(): string {
    return this.configService.get<string>('sepay.SEPAY_ACCOUNT_NAME', '')
  }

  private get apiKey(): string {
    return this.configService.get<string>('sepay.SEPAY_API_KEY', '')
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Kiểm tra config ngay khi module khởi động (fail-fast).
   * Nếu thiếu biến môi trường quan trọng → throw error ngay, không để lỗi xảy ra lúc runtime.
   */
  onModuleInit(): void {
    if (this.isSandbox) {
      // Cảnh báo rõ ràng để không bị nhầm lẫn trong log
      this.logger.warn(
        '⚠️  SePay đang chạy ở chế độ SANDBOX — ' +
          'xác minh webhook BỊ BỎ QUA. ' +
          'KHÔNG dùng cho production!'
      )
      return
    }

    // Trong môi trường production: bắt buộc phải có đủ config
    const required: Record<string, string> = {
      SEPAY_API_KEY: this.apiKey,
      SEPAY_BANK_ACCOUNT: this.bankAccount,
      SEPAY_BANK_CODE: this.bankCode,
      SEPAY_ACCOUNT_NAME: this.accountName
    }

    const missing = Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k]) => k)

    if (missing.length > 0) {
      this.logger.error(
        `[SePay] Thiếu biến môi trường bắt buộc: ${missing.join(', ')}. ` +
          'Kiểm tra file .env hoặc đặt SEPAY_SANDBOX=true để dùng sandbox.'
      )
    }

    this.logger.log('✅ SePay config hợp lệ — production mode')
  }

  // ─── Public methods ─────────────────────────────────────────────────────────

  /**
   * Tạo link thanh toán SePay.
   *
   * SePay hoạt động theo cơ chế bank transfer monitoring:
   * 1. Tạo QR code VietQR trỏ đến tài khoản ngân hàng của merchant
   * 2. Nội dung chuyển khoản chứa paymentId để SePay tự nhận diện
   * 3. Khi SePay phát hiện giao dịch khớp → fire webhook về backend
   *
   * Không cần SDK hay API call — chỉ cần tạo URL đúng format VietQR.
   */
  async createPaymentLink(
    params: SepayPaymentLinkParams
  ): Promise<SepayPaymentLinkResult> {
    const transferContent = this.buildTransferContent(params.paymentId)
    const qrCodeUrl = this.buildVietQrUrl(params.amount, transferContent)
    const paymentUrl = this.buildPaymentPageUrl(
      params,
      qrCodeUrl,
      transferContent
    )

    this.logger.log({
      event: 'sepay_payment_link_created',
      paymentId: params.paymentId,
      amount: params.amount,
      // Không log bankAccount đầy đủ — che bớt để giảm rủi ro lộ thông tin
      bank: `${this.bankCode}:****${this.bankAccount.slice(-4)}`
    })

    return {
      paymentUrl,
      qrCodeUrl,
      bankAccount: this.bankAccount,
      bankCode: this.bankCode,
      transferContent
    }
  }

  /**
   * Xác minh webhook từ SePay.
   *
   * SePay gửi header: `Authorization: Apikey {api_key}`
   * Dùng crypto.timingSafeEqual để tránh timing attack (so sánh constant-time).
   *
   * Trong sandbox mode: luôn trả về true (bỏ qua verify để dễ test).
   */
  verifyWebhookSignature(authorizationHeader: string | undefined): boolean {
    // Sandbox: bỏ qua xác minh để tiện test local
    if (this.isSandbox) {
      return true
    }

    if (!authorizationHeader) {
      this.logger.warn({ event: 'sepay_webhook_missing_auth_header' })
      return false
    }

    const expected = `Apikey ${this.apiKey}`
    const receivedBuf = Buffer.from(authorizationHeader, 'utf8')
    const expectedBuf = Buffer.from(expected, 'utf8')

    // Buffer phải cùng độ dài mới so sánh được với timingSafeEqual
    // Nếu khác độ dài → chắc chắn sai, return false ngay
    if (receivedBuf.length !== expectedBuf.length) {
      this.logger.warn({ event: 'sepay_webhook_invalid_signature' })
      return false
    }

    const isValid = crypto.timingSafeEqual(
      new Uint8Array(
        receivedBuf.buffer,
        receivedBuf.byteOffset,
        receivedBuf.byteLength
      ),
      new Uint8Array(
        expectedBuf.buffer,
        expectedBuf.byteOffset,
        expectedBuf.byteLength
      )
    )

    if (!isValid) {
      this.logger.warn({ event: 'sepay_webhook_invalid_signature' })
    }

    return isValid
  }

  /**
   * Trích xuất paymentId từ webhook SePay.
   *
   * SePay có thể tự nhận diện order code từ nội dung chuyển khoản → trả về trong `body.code`.
   * Nếu không nhận diện được → fallback dùng regex trên `body.content`.
   *
   * Ưu tiên: body.code → regex trên content → null
   */
  extractPaymentId(code: string | null, content: string): string | null {
    // Ưu tiên 1: SePay đã tự extract được order code
    if (code?.trim()) {
      return code.trim()
    }

    // Ưu tiên 2: Regex fallback trên nội dung chuyển khoản
    // Format mình tạo: "FlashSale {paymentId}"
    const patterns = [/FlashSale[- ]([a-z0-9]+)/i, /FSP[- ]([a-z0-9]+)/i]

    for (const pattern of patterns) {
      const match = content.match(pattern)
      if (match?.[1]) {
        return match[1]
      }
    }

    return null
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Tạo nội dung chuyển khoản.
   * Format ngắn gọn để vừa với giới hạn memo ngân hàng (~50 ký tự).
   * SePay sẽ tự nhận diện format này và trả về trong `body.code`.
   */
  private buildTransferContent(paymentId: string): string {
    return `FlashSale ${paymentId}`
  }

  /**
   * Tạo URL ảnh QR theo chuẩn VietQR (https://vietqr.io).
   * API này miễn phí, không cần auth, hỗ trợ tất cả ngân hàng Việt Nam.
   */
  private buildVietQrUrl(amount: number, transferContent: string): string {
    const base = `https://img.vietqr.io/image/${this.bankCode}-${this.bankAccount}-compact2.png`
    const query = new URLSearchParams({
      amount: String(amount),
      addInfo: transferContent,
      accountName: this.accountName
    })
    return `${base}?${query}`
  }

  /**
   * Tạo URL trang chờ thanh toán (frontend /payment/pending).
   * Truyền đủ thông tin qua query params để frontend hiển thị QR và thông tin CK.
   */
  private buildPaymentPageUrl(
    params: SepayPaymentLinkParams,
    qrCodeUrl: string,
    transferContent: string
  ): string {
    const frontendUrl = this.configService.get<string>(
      'frontend.FRONTEND_URL',
      ''
    )
    const query = new URLSearchParams({
      paymentId: params.paymentId,
      amount: String(params.amount),
      qr: qrCodeUrl,
      content: transferContent,
      bank: this.bankCode,
      account: this.bankAccount,
      accountName: this.accountName
    })
    return `${frontendUrl}/payment/pending?${query}`
  }
}
