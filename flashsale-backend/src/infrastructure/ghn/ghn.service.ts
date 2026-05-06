import * as crypto from 'crypto'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { AxiosInstance } from 'axios'
import {
  GHNApiResponse,
  GHNCancelOrderResult,
  GHNCalculateFeeInput,
  GHNCreateOrderInput,
  GHNCreatedOrder,
  GHNError,
  GHNFeeResult,
  GHNOrderDetail,
  GHNServiceItem,
  GHNWebhookPayload
} from './ghn.types'

/** Sandbox base URL — đăng ký tại https://sso.ghn.vn/ */
const GHN_SANDBOX_URL = 'https://dev-online-gateway.ghn.vn/shiip/public-api'
/** Production base URL */
const GHN_PRODUCTION_URL = 'https://online-gateway.ghn.vn/shiip/public-api'

/** Timeout cho API calls — GHN thường < 3s */
const REQUEST_TIMEOUT_MS = 15_000

/**
 * GHNService — thin infrastructure wrapper around GHN Shipping API.
 *
 * Responsibilities:
 * - createOrder: tạo đơn vận chuyển GHN
 * - cancelOrder: huỷ đơn vận chuyển
 * - getOrderDetail: lấy thông tin đơn
 * - getAvailableServices: lấy danh sách dịch vụ khả dụng
 * - calculateFee: tính phí vận chuyển
 * - verifyWebhookToken: verify token từ GHN webhook
 * - parseWebhookPayload: parse raw webhook body
 *
 * Không chứa business logic. FulfillmentService quyết định WHEN và HOW to use.
 *
 * GHN Sandbox:
 * 1. Đăng ký tại https://sso.ghn.vn/
 * 2. Tạo shop để lấy ShopID
 * 3. Lấy API key từ settings
 * 4. Sandbox URL: https://dev-online-gateway.ghn.vn/shiip/public-api
 */
@Injectable()
export class GHNService implements OnModuleInit {
  private readonly logger = new Logger(GHNService.name)
  private axiosInstance!: AxiosInstance
  private apiKey!: string
  private shopId!: number
  private webhookToken!: string
  private sandboxMode!: boolean

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {}

  onModuleInit(): void {
    this.apiKey = this.configService.get<string>('ghn.GHN_API_KEY', '')
    this.shopId = parseInt(
      this.configService.get<string>('ghn.GHN_SHOP_ID', '0'),
      10
    )
    this.webhookToken = this.configService.get<string>(
      'ghn.GHN_WEBHOOK_TOKEN',
      ''
    )
    this.sandboxMode =
      this.configService.get<string>('ghn.GHN_SANDBOX', 'true') === 'true'

    if (!this.apiKey) {
      this.logger.warn(
        'GHN_API_KEY không được cấu hình — GHN API calls sẽ thất bại. ' +
          'Đăng ký tại https://sso.ghn.vn/ để lấy sandbox key.'
      )
    }
    if (!this.shopId) {
      this.logger.warn(
        'GHN_SHOP_ID không được cấu hình — tạo shop tại https://sso.ghn.vn/'
      )
    }

    const baseUrl = this.sandboxMode ? GHN_SANDBOX_URL : GHN_PRODUCTION_URL

    this.axiosInstance = this.httpService.axiosRef
    this.axiosInstance.defaults.baseURL = baseUrl
    this.axiosInstance.defaults.timeout = REQUEST_TIMEOUT_MS
    this.axiosInstance.defaults.headers.common['Token'] = this.apiKey
    this.axiosInstance.defaults.headers.common['ShopId'] = this.shopId
    this.axiosInstance.defaults.headers.common['Content-Type'] =
      'application/json'

    const mode = this.sandboxMode ? 'SANDBOX' : 'PRODUCTION'
    this.logger.log(`GHN initialized — mode: ${mode}, shopId: ${this.shopId}`)
  }

  // ─── Order Management ─────────────────────────────────────────────────────────

  /**
   * createOrder — Tạo đơn vận chuyển mới trong GHN.
   *
   * Sau khi tạo thành công:
   * - GHN trả về order_code (mã vận đơn / tracking code)
   * - Đơn sẽ có status "ready_to_pick" (chờ lấy hàng)
   * - GHN sẽ gửi webhook khi trạng thái thay đổi
   *
   * @param input - Thông tin đơn hàng cần tạo
   * @returns GHNCreatedOrder với order_code là tracking number
   */
  async createOrder(input: GHNCreateOrderInput): Promise<GHNCreatedOrder> {
    return this.post<GHNCreatedOrder>('/v2/shipping-order/create', input)
  }

  /**
   * cancelOrder — Huỷ đơn vận chuyển GHN.
   *
   * Chỉ có thể huỷ khi đơn ở trạng thái chưa lấy hàng.
   * @param orderCode - Mã vận đơn GHN (order_code)
   */
  async cancelOrder(orderCode: string): Promise<GHNCancelOrderResult> {
    const response = await this.post<GHNCancelOrderResult[]>(
      '/v2/switch-status/cancel',
      {
        order_codes: [orderCode]
      }
    )
    const result = Array.isArray(response) ? response[0] : null
    if (!result) {
      throw new GHNError(
        `GHN cancel order không trả về kết quả cho ${orderCode}`,
        'NO_RESULT',
        200
      )
    }
    return result
  }

  /**
   * getOrderDetail — Lấy thông tin chi tiết đơn hàng GHN.
   *
   * @param orderCode - Mã vận đơn GHN
   */
  async getOrderDetail(orderCode: string): Promise<GHNOrderDetail> {
    return this.post<GHNOrderDetail>('/v2/shipping-order/detail', {
      order_code: orderCode
    })
  }

  // ─── Service & Fee ────────────────────────────────────────────────────────────

  /**
   * getAvailableServices — Lấy danh sách dịch vụ vận chuyển khả dụng.
   *
   * @param fromDistrictId - ID quận kho gửi
   * @param toDistrictId - ID quận người nhận
   */
  async getAvailableServices(
    fromDistrictId: number,
    toDistrictId: number
  ): Promise<GHNServiceItem[]> {
    return this.post<GHNServiceItem[]>(
      '/v2/shipping-order/available-services',
      {
        shop_id: this.shopId,
        from_district: fromDistrictId,
        to_district: toDistrictId
      }
    )
  }

  /**
   * calculateFee — Tính phí vận chuyển ước tính.
   *
   * @param input - Thông tin kiện hàng và địa chỉ
   */
  async calculateFee(input: GHNCalculateFeeInput): Promise<GHNFeeResult> {
    return this.post<GHNFeeResult>('/v2/shipping-order/fee', input)
  }

  // ─── Webhook Security ─────────────────────────────────────────────────────────

  /**
   * verifyWebhookToken — Verify token đơn giản từ GHN webhook.
   *
   * GHN không dùng HMAC signature. Thay vào đó, webhook được cấu hình
   * với một token do merchant tự đặt — GHN gửi token này trong body payload.
   *
   * Dùng so sánh hằng thời gian (timingSafeEqual) để tránh timing attack.
   *
   * @param receivedToken - Token nhận được từ header X-GHN-Token hoặc query param
   */
  verifyWebhookToken(receivedToken: string): boolean {
    if (!this.webhookToken) {
      this.logger.warn(
        'GHN_WEBHOOK_TOKEN chưa được cấu hình — bỏ qua xác thực webhook'
      )
      return true // Cho phép trong dev; production phải fail-closed
    }

    if (!receivedToken) return false

    // Sử dụng timingSafeEqual để tránh timing attack
    const expected = new Uint8Array(Buffer.from(this.webhookToken, 'utf-8'))
    const received = new Uint8Array(Buffer.from(receivedToken, 'utf-8'))

    if (expected.length !== received.length) return false
    return crypto.timingSafeEqual(expected, received)
  }

  /**
   * parseWebhookPayload — Parse raw body của GHN webhook.
   * Throws nếu không phải valid JSON hoặc thiếu OrderCode.
   */
  parseWebhookPayload(rawBody: Buffer): GHNWebhookPayload {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody.toString('utf-8'))
    } catch {
      throw new GHNError(
        'GHN webhook body không hợp lệ (JSON)',
        'INVALID_JSON',
        400
      )
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)['OrderCode'] !== 'string'
    ) {
      throw new GHNError(
        'GHN webhook thiếu trường OrderCode',
        'MISSING_ORDER_CODE',
        400
      )
    }

    return parsed as GHNWebhookPayload
  }

  // ─── Private HTTP helpers ─────────────────────────────────────────────────────

  private async post<T>(path: string, data: unknown): Promise<T> {
    try {
      const response = await this.axiosInstance.post<GHNApiResponse<T>>(
        path,
        data
      )
      return this.unwrap(response.data, `POST ${path}`)
    } catch (err: unknown) {
      throw this.wrapError(err, `POST ${path}`)
    }
  }

  private unwrap<T>(response: GHNApiResponse<T>, context: string): T {
    if (response.code !== 200) {
      throw new GHNError(
        response.message ?? `GHN error ${response.code}`,
        response.code_message ?? `GHN_${response.code}`,
        response.code,
        response
      )
    }
    if (response.data === null) {
      throw new GHNError(`GHN ${context} returned null data`, 'NULL_DATA', 200)
    }
    return response.data
  }

  private wrapError(err: unknown, context: string): GHNError {
    if (err instanceof GHNError) return err

    const axiosErr = err as {
      response?: {
        status: number
        data?: GHNApiResponse<unknown>
      }
      message?: string
    }

    if (axiosErr.response) {
      const status = axiosErr.response.status
      const body = axiosErr.response.data
      const message = body?.message ?? `GHN API error (HTTP ${status})`
      const code = body?.code_message ?? `HTTP_${status}`
      this.logger.error(
        `GHN ${context} thất bại: [${code}] ${message} (HTTP ${status})`
      )
      return new GHNError(message, code, status, body)
    }

    const message = axiosErr.message ?? 'GHN network error'
    this.logger.error(`GHN ${context} lỗi mạng: ${message}`)
    return new GHNError(message, 'NETWORK_ERROR', 0)
  }
}
