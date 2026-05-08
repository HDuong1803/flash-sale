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

const GHN_SANDBOX_URL = 'https://dev-online-gateway.ghn.vn/shiip/public-api'
const GHN_PRODUCTION_URL = 'https://online-gateway.ghn.vn/shiip/public-api'
const REQUEST_TIMEOUT_MS = 15_000

/**
 * GHNService — thin infrastructure wrapper around GHN Shipping API.
 * Sử dụng raw Axios cho order/fee operations.
 */
@Injectable()
export class GHNService implements OnModuleInit {
  private readonly logger = new Logger(GHNService.name)
  private axiosInstance!: AxiosInstance
  private webhookToken!: string
  private fromName!: string
  private fromPhone!: string
  private fromAddress!: string
  private fromWardName!: string
  private fromDistrictName!: string
  private fromProvinceName!: string

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('ghn.GHN_API_KEY', '')
    const shopId = parseInt(
      this.configService.get<string>('ghn.GHN_SHOP_ID', '0'),
      10
    )
    this.webhookToken = this.configService.get<string>(
      'ghn.GHN_WEBHOOK_TOKEN',
      ''
    )
    this.fromName = this.configService.get<string>(
      'ghn.GHN_FROM_NAME',
      'Flash Sale Shop'
    )
    this.fromPhone = this.configService.get<string>('ghn.GHN_FROM_PHONE', '')
    this.fromAddress = this.configService.get<string>(
      'ghn.GHN_FROM_ADDRESS',
      ''
    )
    this.fromWardName = this.configService.get<string>(
      'ghn.GHN_FROM_WARD_NAME',
      ''
    )
    this.fromDistrictName = this.configService.get<string>(
      'ghn.GHN_FROM_DISTRICT_NAME',
      ''
    )
    this.fromProvinceName = this.configService.get<string>(
      'ghn.GHN_FROM_PROVINCE_NAME',
      ''
    )

    const isSandbox =
      this.configService.get<string>('ghn.GHN_SANDBOX', 'true') === 'true'

    if (!apiKey) {
      this.logger.warn(
        'GHN_API_KEY chưa cấu hình — đăng ký tại https://sso.ghn.vn/'
      )
    }
    if (!shopId) {
      this.logger.warn(
        'GHN_SHOP_ID chưa cấu hình — tạo shop tại https://sso.ghn.vn/'
      )
    }

    const baseUrl = isSandbox ? GHN_SANDBOX_URL : GHN_PRODUCTION_URL

    this.axiosInstance = this.httpService.axiosRef
    this.axiosInstance.defaults.baseURL = baseUrl
    this.axiosInstance.defaults.timeout = REQUEST_TIMEOUT_MS
    this.axiosInstance.defaults.headers.common['Token'] = apiKey
    this.axiosInstance.defaults.headers.common['ShopId'] = shopId
    this.axiosInstance.defaults.headers.common['Content-Type'] =
      'application/json'

    this.logger.log(
      `GHN initialized — mode: ${
        isSandbox ? 'SANDBOX' : 'PRODUCTION'
      }, shopId: ${shopId}`
    )
  }

  // ─── Order Management ─────────────────────────────────────────────────────────

  async createOrder(input: GHNCreateOrderInput): Promise<GHNCreatedOrder> {
    return this.post<GHNCreatedOrder>('/v2/shipping-order/create', {
      ...input,
      from_name: this.fromName,
      from_phone: this.fromPhone,
      from_address: this.fromAddress,
      from_ward_name: this.fromWardName || undefined,
      from_district_name: this.fromDistrictName || undefined,
      from_province_name: this.fromProvinceName || undefined
    })
  }

  async cancelOrder(orderCode: string): Promise<GHNCancelOrderResult> {
    const response = await this.post<GHNCancelOrderResult[]>(
      '/v2/switch-status/cancel',
      { order_codes: [orderCode] }
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

  async getOrderDetail(orderCode: string): Promise<GHNOrderDetail> {
    return this.post<GHNOrderDetail>('/v2/shipping-order/detail', {
      order_code: orderCode
    })
  }

  // ─── Service & Fee ────────────────────────────────────────────────────────────

  async getAvailableServices(
    fromDistrictId: number,
    toDistrictId: number
  ): Promise<GHNServiceItem[]> {
    return this.post<GHNServiceItem[]>(
      '/v2/shipping-order/available-services',
      {
        shop_id: parseInt(
          this.configService.get<string>('ghn.GHN_SHOP_ID', '0'),
          10
        ),
        from_district: fromDistrictId,
        to_district: toDistrictId
      }
    )
  }

  async calculateFee(input: GHNCalculateFeeInput): Promise<GHNFeeResult> {
    return this.post<GHNFeeResult>('/v2/shipping-order/fee', input)
  }

  // ─── Webhook Security ─────────────────────────────────────────────────────────

  verifyWebhookToken(receivedToken: string): boolean {
    if (!this.webhookToken) {
      this.logger.warn(
        'GHN_WEBHOOK_TOKEN chưa cấu hình — bỏ qua xác thực webhook'
      )
      return true
    }
    if (!receivedToken) return false
    const expected = new Uint8Array(Buffer.from(this.webhookToken, 'utf-8'))
    const received = new Uint8Array(Buffer.from(receivedToken, 'utf-8'))
    if (expected.length !== received.length) return false
    return crypto.timingSafeEqual(expected, received)
  }

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
    this.logger.log(`GHN ${path} request: ${JSON.stringify(data)}`)
    try {
      const response = await this.axiosInstance.post<GHNApiResponse<T>>(
        path,
        data
      )
      this.logger.log(`GHN ${path} response: ${JSON.stringify(response.data)}`)
      return this.unwrap(response.data, `POST ${path}`)
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'response' in err &&
        (err as { response?: { data?: unknown } }).response
      ) {
        this.logger.error(
          `GHN ${path} raw response: ${JSON.stringify(
            (err as { response: { data: unknown } }).response.data,
            null,
            2
          )}`
        )
      }
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
      response?: { status: number; data?: GHNApiResponse<unknown> }
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
