import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { AxiosInstance } from 'axios'
import * as crypto from 'crypto'
import {
  EasyPostAddress,
  EasyPostAddressInput,
  EasyPostError,
  EasyPostParcel,
  EasyPostRate,
  EasyPostShipment,
  EasyPostWebhookPayload
} from './easypost.types'

/** EasyPost REST API base URL (v2) */
const EASYPOST_BASE_URL = 'https://api.easypost.com/v2'

/** Timeout cho API calls — EasyPost thường < 2s nhưng label generation có thể ~5s */
const REQUEST_TIMEOUT_MS = 15_000

/**
 * EasyPostService — thin infrastructure wrapper around EasyPost REST API v2.
 *
 * Responsibilities:
 * - Address validation / normalization
 * - Shipment creation + rate shopping
 * - Label purchase
 * - Webhook HMAC signature verification
 *
 * Không chứa business logic. FulfillmentService quyết định WHEN và HOW to use these methods.
 *
 * EasyPost sandbox: dùng test API key (EZAK...) — labels được tạo thật nhưng không charge.
 * Tracking events trong sandbox được simulate tự động.
 */
@Injectable()
export class EasyPostService implements OnModuleInit {
  private readonly logger = new Logger(EasyPostService.name)
  private axiosInstance!: AxiosInstance
  private apiKey!: string
  private webhookSecret!: string
  private sandboxMode!: boolean

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {}

  onModuleInit(): void {
    this.apiKey = this.configService.get<string>(
      'easypost.EASYPOST_API_KEY',
      ''
    )
    this.webhookSecret = this.configService.get<string>(
      'easypost.EASYPOST_WEBHOOK_SECRET',
      ''
    )
    this.sandboxMode =
      this.configService.get<string>('easypost.EASYPOST_SANDBOX', 'true') ===
      'true'

    if (!this.apiKey) {
      this.logger.warn(
        'EASYPOST_API_KEY not configured — EasyPost calls will fail. ' +
          'Set sandbox key for demo: https://easypost.com/signup'
      )
    }

    // Build axios instance with auth + timeout pre-configured
    this.axiosInstance = this.httpService.axiosRef
    this.axiosInstance.defaults.baseURL = EASYPOST_BASE_URL
    this.axiosInstance.defaults.timeout = REQUEST_TIMEOUT_MS
    this.axiosInstance.defaults.headers.common[
      'Authorization'
    ] = `EasyPost ${this.apiKey}`
    this.axiosInstance.defaults.headers.common['Content-Type'] =
      'application/json'

    const mode = this.sandboxMode ? 'SANDBOX' : 'PRODUCTION'
    this.logger.log(`EasyPost initialized — mode: ${mode}`)
  }

  // ─── Address ────────────────────────────────────────────────────────────────

  /**
   * createAndVerifyAddress — Tạo address object trong EasyPost và verify deliverability.
   *
   * EasyPost thực hiện CASS (Coding Accuracy Support System) normalization theo chuẩn USPS:
   * - Chuẩn hoá street abbreviations
   * - Verify ZIP+4
   * - Trả về deliverability: "deliverable" | "deliverable_unnecessary_unit" | "undeliverable" | "no_data"
   *
   * Edge cases:
   * - Địa chỉ quốc tế: EasyPost verify ít hơn, trả về success=true nhưng không CASS-normalize
   * - APO/FPO: verify không có CASS nhưng vẫn accept
   * - PO Box: deliverable nhưng một số carrier không ship
   */
  async createAndVerifyAddress(
    input: EasyPostAddressInput
  ): Promise<EasyPostAddress> {
    const payload = {
      address: {
        ...input,
        verify: true
      }
    }

    const response = await this.post<{ address: EasyPostAddress }>(
      '/addresses',
      payload
    )

    return response.address
  }

  // ─── Shipment ───────────────────────────────────────────────────────────────

  /**
   * createShipment — Tạo shipment và lấy rates từ tất cả carrier accounts configured.
   *
   * Rates được trả về đã sort theo giá (rẻ nhất trước) từ EasyPost.
   * FulfillmentRulesEngine sẽ lọc để chọn đúng carrier theo rule.
   *
   * @param fromAddress - Địa chỉ kho/warehouse (từ EasyPost Address ID hoặc inline)
   * @param toAddress - Địa chỉ customer (cần validate trước)
   * @param parcel - Kích thước + weight (oz) của kiện hàng
   */
  async createShipment(
    fromAddress: EasyPostAddressInput | string,
    toAddress: EasyPostAddressInput | string,
    parcel: EasyPostParcel
  ): Promise<EasyPostShipment> {
    const payload = {
      shipment: {
        to_address:
          typeof toAddress === 'string' ? { id: toAddress } : toAddress,
        from_address:
          typeof fromAddress === 'string' ? { id: fromAddress } : fromAddress,
        parcel
      }
    }

    const response = await this.post<{ shipment: EasyPostShipment }>(
      '/shipments',
      payload
    )

    return response.shipment
  }

  /**
   * buyLabel — Mua label cho shipment với rate đã chọn.
   *
   * Sau khi mua:
   * - EasyPost tạo label (PDF + ZPL)
   * - Tracking number được assign
   * - Billing charge xảy ra (sandbox: không charge thật)
   *
   * Label URL valid trong 14 ngày. Sau đó phải regenerate.
   */
  async buyLabel(
    shipmentId: string,
    rateId: string,
    insuranceCents?: number
  ): Promise<EasyPostShipment> {
    const payload: Record<string, unknown> = { rate: { id: rateId } }
    if (insuranceCents !== undefined) {
      // EasyPost insurance nhận USD (float string), không phải cents
      payload.insurance = (insuranceCents / 100).toFixed(2)
    }

    const response = await this.post<{ shipment: EasyPostShipment }>(
      `/shipments/${shipmentId}/buy`,
      payload
    )

    return response.shipment
  }

  // ─── Rate Selection Helper ───────────────────────────────────────────────────

  /**
   * selectRateForCarrier — Tìm rate phù hợp nhất cho carrier code đã cho.
   *
   * Ưu tiên:
   * 1. Service match với carrier code
   * 2. Rẻ nhất trong các rates của carrier đó
   *
   * Return null nếu carrier không có rate nào trong shipment.
   */
  selectRateForCarrier(
    rates: EasyPostRate[],
    carrierCode: string
  ): EasyPostRate | null {
    const matching = rates.filter(
      r => r.carrier.toUpperCase() === carrierCode.toUpperCase()
    )

    if (matching.length === 0) return null

    // Sort by rate price ascending, pick cheapest
    return (
      matching.sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0] ??
      null
    )
  }

  // ─── Webhook Security ────────────────────────────────────────────────────────

  /**
   * verifyWebhookSignature — Verify HMAC-256 signature từ EasyPost.
   *
   * EasyPost gửi header: `X-Hmac-Signature: hmac-sha256-hex={signature}`
   * Chúng ta tính HMAC-SHA256(webhookSecret, requestBody) và so sánh.
   *
   * Dùng crypto.timingSafeEqual để tránh timing attack.
   *
   * @param rawBody - Buffer của raw request body (KHÔNG parse JSON trước)
   * @param signatureHeader - Giá trị header X-Hmac-Signature từ request
   * @returns true nếu signature hợp lệ
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn(
        'EASYPOST_WEBHOOK_SECRET not configured — skipping signature verification'
      )
      return true // Allow in dev; production must fail-closed
    }

    // Header format: "hmac-sha256-hex=<hex_digest>"
    const prefix = 'hmac-sha256-hex='
    if (!signatureHeader.startsWith(prefix)) {
      return false
    }

    const receivedHex = signatureHeader.slice(prefix.length)

    const expectedHmac = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex')

    // timingSafeEqual requires same-length Buffers
    const expectedBuf = Buffer.from(expectedHmac, 'hex')
    const receivedBuf = Buffer.from(receivedHex, 'hex')

    if (expectedBuf.length !== receivedBuf.length) return false

    return crypto.timingSafeEqual(expectedBuf, receivedBuf)
  }

  /**
   * parseWebhookPayload — Safe parse của EasyPost webhook payload.
   * Throws nếu không phải valid JSON hoặc missing required fields.
   */
  parseWebhookPayload(rawBody: Buffer): EasyPostWebhookPayload {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody.toString('utf-8'))
    } catch {
      throw new EasyPostError('Invalid webhook JSON body', 'INVALID_JSON', 400)
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Record<string, unknown>)['object'] !== 'Event'
    ) {
      throw new EasyPostError(
        'Webhook payload is not an EasyPost Event',
        'NOT_EVENT',
        400
      )
    }

    return parsed as EasyPostWebhookPayload
  }

  // ─── Private HTTP helpers ────────────────────────────────────────────────────

  private async post<T>(path: string, data: unknown): Promise<T> {
    try {
      const response = await this.axiosInstance.post<T>(path, data)
      return response.data
    } catch (err: unknown) {
      throw this.wrapError(err, `POST ${path}`)
    }
  }

  private wrapError(err: unknown, context: string): EasyPostError {
    if (err instanceof EasyPostError) return err

    // Axios error with response
    const axiosErr = err as {
      response?: {
        status: number
        data?: { error?: { code: string; message: string } }
      }
      message?: string
    }

    if (axiosErr.response) {
      const status = axiosErr.response.status
      const epError = axiosErr.response.data?.error
      const code = epError?.code ?? `HTTP_${status}`
      const message = epError?.message ?? `EasyPost API error (${status})`

      this.logger.error(
        `EasyPost ${context} failed: [${code}] ${message} (HTTP ${status})`
      )
      return new EasyPostError(message, code, status, axiosErr.response.data)
    }

    // Network / timeout error
    const message = axiosErr.message ?? 'EasyPost network error'
    this.logger.error(`EasyPost ${context} network error: ${message}`)
    return new EasyPostError(message, 'NETWORK_ERROR', 0)
  }
}
