import * as crypto from 'crypto'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Ghn } from 'giaohangnhanh'
import {
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

const GHN_SANDBOX_HOST = 'https://dev-online-gateway.ghn.vn'
const GHN_PRODUCTION_HOST = 'https://online-gateway.ghn.vn'

/**
 * GHNService — thin infrastructure wrapper around GHN Shipping API.
 * Sử dụng giaohangnhanh npm package cho order/fee operations.
 */
@Injectable()
export class GHNService implements OnModuleInit {
  private readonly logger = new Logger(GHNService.name)
  private ghn!: Ghn
  private webhookToken!: string
  private fromName!: string
  private fromPhone!: string
  private fromAddress!: string
  private fromWardName!: string
  private fromDistrictName!: string
  private fromProvinceName!: string
  private sandboxMode!: boolean

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('ghn.GHN_API_KEY', '')
    const shopId = parseInt(
      this.configService.get<string>('ghn.GHN_SHOP_ID', '0'),
      10
    )
    this.sandboxMode =
      this.configService.get<string>('ghn.GHN_SANDBOX', 'true') === 'true'
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

    if (!apiKey || !shopId) {
      this.logger.warn(
        'GHN_API_KEY hoặc GHN_SHOP_ID chưa cấu hình — đăng ký tại https://sso.ghn.vn/'
      )
    }

    this.ghn = new Ghn({
      token: apiKey || 'placeholder',
      shopId: shopId || 1,
      host: this.sandboxMode ? GHN_SANDBOX_HOST : GHN_PRODUCTION_HOST,
      testMode: this.sandboxMode
    })

    this.logger.log(
      `GHN initialized — mode: ${
        this.sandboxMode ? 'SANDBOX' : 'PRODUCTION'
      }, shopId: ${shopId}`
    )
  }

  // ─── Order Management ─────────────────────────────────────────────────────────

  async createOrder(input: GHNCreateOrderInput): Promise<GHNCreatedOrder> {
    // GHN sandbox không hỗ trợ tạo đơn thật — mock response
    if (this.sandboxMode) {
      const mockCode = `GHN-SANDBOX-${Date.now()}`
      this.logger.warn(`[SANDBOX] Mock order_code: ${mockCode}`)
      return {
        order_code: mockCode,
        sort_code: 'SBX',
        expected_delivery_time: new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000
        ).toISOString(),
        fee: {
          main_service: 0,
          insurance: 0,
          station_pu: 0,
          station_do: 0,
          return: 0,
          r2s: 0,
          coupon: 0
        },
        total_fee: '0',
        trans_type: 'truck',
        district_encode: '',
        ward_encode: ''
      }
    }

    try {
      const result = await this.ghn.order.createOrder({
        to_name: input.to_name,
        to_phone: input.to_phone,
        to_address: input.to_address,
        to_ward_code: input.to_ward_code,
        to_district_id: input.to_district_id,
        // from_* omitted — GHN tự dùng warehouse mặc định của ShopId
        from_name: this.fromName,
        from_phone: this.fromPhone,
        from_address: this.fromAddress,
        from_ward_name: this.fromWardName,
        from_district_name: this.fromDistrictName,
        from_province_name: this.fromProvinceName,
        weight: input.weight,
        length: input.length ?? 20,
        width: input.width ?? 20,
        height: input.height ?? 10,
        service_type_id: input.service_type_id,
        payment_type_id: input.payment_type_id,
        required_note: input.required_note,
        client_order_code: input.client_order_code ?? null,
        cod_amount: input.cod_amount ?? 0,
        insurance_value: input.insurance_value,
        content: input.content,
        note: input.note,
        items: input.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          weight: item.weight,
          code: item.code,
          price: item.price,
          length: item.length,
          width: item.width,
          height: item.height
        }))
      })

      return {
        order_code: result.order_code,
        sort_code: result.sort_code,
        expected_delivery_time:
          result.expected_delivery_time instanceof Date
            ? result.expected_delivery_time.toISOString()
            : String(result.expected_delivery_time),
        fee: {
          main_service: result.fee.main_service,
          insurance: result.fee.insurance,
          station_pu: result.fee.station_pu,
          station_do: result.fee.station_do,
          return: result.fee.return,
          r2s: result.fee.r2s,
          coupon: result.fee.coupon
        },
        total_fee: String(result.total_fee),
        trans_type: result.trans_type,
        district_encode: result.district_encode ?? '',
        ward_encode: result.ward_encode ?? ''
      }
    } catch (err: unknown) {
      throw this.wrapError(err, 'createOrder')
    }
  }

  async cancelOrder(orderCode: string): Promise<GHNCancelOrderResult> {
    try {
      await this.ghn.order.cancelOrder({ orderCodes: [orderCode] })
      return { order_code: orderCode, result: true, message: 'Cancelled' }
    } catch (err: unknown) {
      throw this.wrapError(err, 'cancelOrder')
    }
  }

  async getOrderDetail(orderCode: string): Promise<GHNOrderDetail> {
    try {
      const result = await this.ghn.order.orderInfo({ order_code: orderCode })
      return result as unknown as GHNOrderDetail
    } catch (err: unknown) {
      throw this.wrapError(err, 'getOrderDetail')
    }
  }

  // ─── Service & Fee ────────────────────────────────────────────────────────────

  async getAvailableServices(
    fromDistrictId: number,
    toDistrictId: number
  ): Promise<GHNServiceItem[]> {
    try {
      const results = await this.ghn.calculateFee.getServiceList(
        fromDistrictId,
        toDistrictId
      )
      return results.map(s => ({
        service_id: s.service_id,
        short_name: s.short_name,
        service_type_id: s.service_type_id
      }))
    } catch (err: unknown) {
      throw this.wrapError(err, 'getAvailableServices')
    }
  }

  async calculateFee(input: GHNCalculateFeeInput): Promise<GHNFeeResult> {
    try {
      const result = await this.ghn.calculateFee.calculateShippingFee({
        service_id: input.service_id,
        service_type_id: input.service_type_id,
        from_district_id: input.from_district_id,
        to_district_id: input.to_district_id,
        to_ward_code: input.to_ward_code,
        weight: input.weight,
        length: input.length,
        width: input.width,
        height: input.height,
        insurance_value: input.insurance_value,
        coupon: input.coupon
      })
      return result as unknown as GHNFeeResult
    } catch (err: unknown) {
      throw this.wrapError(err, 'calculateFee')
    }
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

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private wrapError(err: unknown, context: string): GHNError {
    if (err instanceof GHNError) return err
    const message = err instanceof Error ? err.message : String(err)
    this.logger.error(`GHN ${context} thất bại: ${message}`)
    return new GHNError(message, 'GHN_ERROR', 0)
  }
}
