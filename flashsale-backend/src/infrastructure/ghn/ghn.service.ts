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

/**
 * GHNService — thin infrastructure wrapper around GHN Shipping API.
 *
 * Sử dụng giaohangnhanh npm package để giao tiếp với GHN API.
 * Sandbox URL: https://dev-online-gateway.ghn.vn
 *
 * Responsibilities:
 * - createOrder: tạo đơn vận chuyển GHN
 * - cancelOrder: huỷ đơn vận chuyển
 * - getOrderDetail: lấy thông tin đơn
 * - getAvailableServices: lấy danh sách dịch vụ khả dụng
 * - calculateFee: tính phí vận chuyển
 * - verifyWebhookToken: verify token từ GHN webhook
 * - parseWebhookPayload: parse raw webhook body
 */
@Injectable()
export class GHNService implements OnModuleInit {
  private readonly logger = new Logger(GHNService.name)
  private ghn!: Ghn
  private webhookToken!: string

  constructor(private readonly configService: ConfigService) {}

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
    const isSandbox =
      this.configService.get<string>('ghn.GHN_SANDBOX', 'true') === 'true'

    if (!apiKey) {
      this.logger.warn(
        'GHN_API_KEY chưa cấu hình — API calls sẽ thất bại. ' +
          'Đăng ký tại https://sso.ghn.vn/ để lấy sandbox key.'
      )
    }
    if (!shopId) {
      this.logger.warn(
        'GHN_SHOP_ID chưa cấu hình — tạo shop tại https://sso.ghn.vn/'
      )
    }

    this.ghn = new Ghn({
      token: apiKey,
      shopId,
      host: isSandbox
        ? 'https://dev-online-gateway.ghn.vn'
        : 'https://online-gateway.ghn.vn',
      testMode: isSandbox
    })

    this.logger.log(
      `GHN initialized — mode: ${
        isSandbox ? 'SANDBOX' : 'PRODUCTION'
      }, shopId: ${shopId}`
    )
  }

  // ─── Order Management ─────────────────────────────────────────────────────────

  async createOrder(input: GHNCreateOrderInput): Promise<GHNCreatedOrder> {
    try {
      const result = await this.ghn.order.createOrder({
        to_name: input.to_name,
        to_phone: input.to_phone,
        to_address: input.to_address,
        to_ward_code: input.to_ward_code,
        to_district_id: input.to_district_id,
        from_name: '',
        from_phone: '',
        from_address: '',
        from_ward_name: '',
        from_district_name: '',
        from_province_name: '',
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
        return_phone: input.return_phone,
        return_address: input.return_address,
        return_district_id: input.return_district_id ?? null,
        return_ward_code: input.return_ward_code,
        items: input.items.map(item => ({
          name: item.name,
          code: item.code,
          quantity: item.quantity,
          price: item.price,
          weight: item.weight,
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
