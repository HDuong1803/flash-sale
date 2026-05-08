import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { FulfillmentStatus, NotificationType } from '@prisma/client'
import { GHNService } from '@infrastructure/ghn/ghn.service'
import { GHNAddressService } from '@infrastructure/ghn/ghn.address.service'
import { GHNError, GHNCreateOrderInput } from '@infrastructure/ghn/ghn.types'
import { RedisService } from '@infrastructure/redis/redis.service'
import { NotificationService } from '@modules/notification/services/notification.service'
import {
  FulfillmentRepository,
  FulfillmentOrderWithCarrier
} from '../repositories/fulfillment.repository'
import { QcRepository } from '../repositories/qc.repository'
import { FulfillmentRulesEngine } from './fulfillment-rules.engine'

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * GHN service_type_id mặc định khi không có rule match.
 * 2 = E-commerce (Express), 5 = Traditional (Eco)
 */
const DEFAULT_GHN_SERVICE_TYPE_ID = 2 as const

/**
 * GHN required_note mặc định.
 * CHOTHUHANG = cho thử hàng (khách được xem trước khi nhận)
 */
const DEFAULT_REQUIRED_NOTE = 'CHOTHUHANG' as const

/**
 * GHN tracking URL template — dùng để tạo link theo dõi đơn hàng.
 * Thay {order_code} bằng mã vận đơn thực tế.
 */
const GHN_TRACKING_URL_TEMPLATE =
  'https://tracking.ghn.dev/?order_code={order_code}'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Địa chỉ VN có cấu trúc — lưu dạng JSON trong Order.shippingAddress */
export interface VNAddressInput {
  to_name: string
  to_phone: string
  to_address: string
  to_ward_code: string
  to_district_id: number
  to_ward_name: string
  to_district_name: string
  to_province_name: string
}

export interface InitializeFulfillmentInput {
  orderId: string
  shippingAddress: string
  /** Total order amount in VND (Decimal string from Prisma) */
  totalAmount: string
  /** merchantId để route về đúng merchant */
  merchantId: string
  /** campaignId để publish SSE event */
  campaignId: string
}

export interface BookLabelInput {
  orderId: string
  /** Weight in grams (default: 500g nếu không cung cấp) */
  weightGrams?: number
  /** Dimensions in centimeters */
  dimensionsCm?: { l: number; w: number; h: number }
}

/**
 * FulfillmentService — Orchestrates the entire fulfillment lifecycle.
 *
 * Responsibilities:
 * - initializeFulfillment: trigger khi order CONFIRMED (fire-and-forget từ saga)
 * - bookLabel: gọi khi QC pass — tạo đơn vận chuyển GHN
 * - handleGHNWebhook: xử lý tracking update từ GHN webhook
 *
 * Design decisions:
 * - initializeFulfillment là fire-and-forget: không throw nếu lỗi, chỉ log.
 *   Reason: không được làm fail payment saga vì fulfillment là side-effect.
 * - bookLabel có thể retry: idempotent check qua ghnOrderCode.
 * - Tracking events là append-only: không update, chỉ insert.
 */
@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name)

  private static readonly DEFAULT_QC_CHECKLIST = [
    { key: 'item_count', label: 'Số lượng sản phẩm đúng', passed: null },
    { key: 'packaging', label: 'Đóng gói nguyên vẹn', passed: null },
    { key: 'label_match', label: 'Label khớp với đơn hàng', passed: null },
    { key: 'no_damage', label: 'Sản phẩm không bị hỏng hóc', passed: null }
  ] as const

  constructor(
    private readonly fulfillmentRepo: FulfillmentRepository,
    private readonly qcRepo: QcRepository,
    private readonly rulesEngine: FulfillmentRulesEngine,
    private readonly ghn: GHNService,
    private readonly ghnAddress: GHNAddressService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService
  ) {}

  /**
   * initializeFulfillment — Tạo FulfillmentOrder ngay sau khi Order confirmed.
   *
   * Flow:
   * 1. Parse + validate địa chỉ VN (ward_code/district_id)
   * 2. Load active rules + evaluate → select carrier
   * 3. Tính SLA deadline
   * 4. Persist FulfillmentOrder
   * 5. Publish SSE event FULFILLMENT_INITIALIZED
   *
   * CRITICAL: Hàm này KHÔNG được throw. Gọi bởi saga sau khi createOrderWithItems()
   * thành công. Nếu throw → saga rollback → order bị mất dù đã tạo thành công.
   *
   * Error handling: log error, tạo FulfillmentOrder với status AWAITING
   * (address validation failed riêng → ADDRESS_ISSUE status).
   */
  async initializeFulfillment(
    input: InitializeFulfillmentInput
  ): Promise<void> {
    const { orderId, shippingAddress, totalAmount, campaignId } = input

    try {
      // Idempotency: skip nếu đã tạo (saga retry case)
      const existing = await this.fulfillmentRepo.findByOrderId(orderId)
      if (existing) {
        this.logger.debug(
          `FulfillmentOrder đã tồn tại cho order ${orderId}, bỏ qua init`
        )
        return
      }

      // Step 1: Load rules (batch, không N+1)
      const rules = await this.fulfillmentRepo.findActiveRules()

      // Step 2: Validate địa chỉ VN + evaluate rules concurrently
      const totalCents = Math.round(parseFloat(totalAmount) * 100)
      const ctx = this.rulesEngine.buildContext({
        orderTotalCents: totalCents,
        shippingAddress
      })

      const [addressResult, decision] = await Promise.all([
        this.validateVNAddressSafe(shippingAddress),
        Promise.resolve(this.rulesEngine.evaluateSync(rules, ctx))
      ])

      // Step 3: Determine carrier + SLA
      const carrierId = decision.matched ? decision.carrierId : null
      const slaHours = decision.matched ? decision.slaHours : null
      const slaDeadline =
        slaHours !== null
          ? new Date(Date.now() + slaHours * 60 * 60 * 1000)
          : null

      if (!decision.matched) {
        const noMatchReason = (decision as { matched: false; reason: string })
          .reason
        this.logger.warn(
          `Không có fulfillment rule phù hợp cho order ${orderId} (${noMatchReason}). ` +
            'FulfillmentOrder tạo không có carrier assignment.'
        )
      }

      // Step 4: Persist
      const fulfillment = await this.fulfillmentRepo.createFulfillmentOrder({
        orderId,
        carrierId,
        slaHours,
        slaDeadline,
        addressValidated: addressResult.valid,
        normalizedAddress: addressResult.normalized
      })

      // Step 5: If address invalid → mark ADDRESS_ISSUE
      if (!addressResult.valid) {
        await this.fulfillmentRepo.updateAddressIssue(
          fulfillment.id,
          addressResult.error ?? 'Address validation failed'
        )
        this.logger.warn(
          `Order ${orderId}: address validation failed — "${addressResult.error}"`
        )
      }

      // Step 6: Auto-create QcCheckpoint + notify merchant
      if (addressResult.valid) {
        await this.qcRepo.autoCreateCheckpointForOrder(orderId, [
          ...FulfillmentService.DEFAULT_QC_CHECKLIST
        ])
        this.notifyMerchantQcRequired(input.merchantId, orderId)
      }

      // Step 7: Publish SSE event
      await this.publishFulfillmentEvent(campaignId, {
        type: 'FULFILLMENT_INITIALIZED',
        orderId,
        fulfillmentId: fulfillment.id,
        status: addressResult.valid
          ? FulfillmentStatus.AWAITING
          : FulfillmentStatus.ADDRESS_ISSUE,
        carrierCode: decision.matched ? decision.carrierCode : null,
        slaDeadline: slaDeadline?.toISOString() ?? null
      })

      this.logger.log(
        `Fulfillment initialized: order=${orderId}, ` +
          `carrier=${
            decision.matched ? decision.carrierCode : 'UNASSIGNED'
          }, ` +
          `sla=${slaHours ?? 'N/A'}h, addressValid=${addressResult.valid}`
      )
    } catch (err: unknown) {
      // NEVER propagate — this is a fire-and-forget side effect of saga
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `initializeFulfillment thất bại cho order ${orderId}: ${message}`
      )
    }
  }

  /**
   * bookLabel — Tạo đơn vận chuyển GHN cho đơn hàng.
   *
   * Flow:
   * 1. Load FulfillmentOrder (phải tồn tại)
   * 2. Idempotency: nếu đã có GHN order_code → return existing
   * 3. Parse địa chỉ VN từ shippingAddress JSON
   * 4. Gọi GHN createOrder
   * 5. Update DB + publish SSE
   *
   * Throws NotFoundException nếu order không tồn tại.
   * Throws GHNError nếu GHN API lỗi (caller xử lý retry).
   */
  async bookLabel(input: BookLabelInput): Promise<FulfillmentOrderWithCarrier> {
    const { orderId, weightGrams = 500, dimensionsCm } = input

    // Fetch order + fulfillment details
    const fulfillment = await this.fulfillmentRepo.findByOrderId(orderId)
    if (!fulfillment) {
      throw new NotFoundException(
        `FulfillmentOrder không tìm thấy cho order ${orderId}`
      )
    }

    // Idempotency: GHN order đã tạo → trả về existing
    if (
      fulfillment.labelUrl &&
      fulfillment.fulfillStatus !== FulfillmentStatus.AWAITING
    ) {
      this.logger.debug(`GHN order đã tạo cho order ${orderId}`)
      return fulfillment
    }

    // Cannot book label for ADDRESS_ISSUE orders
    if (fulfillment.fulfillStatus === FulfillmentStatus.ADDRESS_ISSUE) {
      throw new Error(
        `Không thể tạo đơn GHN: địa chỉ giao hàng không hợp lệ cho order ${orderId}`
      )
    }

    // Get order details (raw shippingAddress JSON)
    const orderData = await this.getOrderShippingAddress(orderId)
    const toAddress = this.parseVNAddress(orderData.shippingAddress)

    // Build GHN create order payload
    // from_* fields omitted — GHN tự dùng warehouse mặc định của shop (ShopId)
    const ghnOrderInput: GHNCreateOrderInput = {
      to_name: toAddress.to_name,
      to_phone: toAddress.to_phone,
      to_address: toAddress.to_address,
      to_ward_code: toAddress.to_ward_code,
      to_district_id: toAddress.to_district_id,
      to_ward_name: toAddress.to_ward_name || undefined,
      to_district_name: toAddress.to_district_name || undefined,
      to_province_name: toAddress.to_province_name || undefined,
      weight: weightGrams,
      length: dimensionsCm?.l ?? 20,
      width: dimensionsCm?.w ?? 20,
      height: dimensionsCm?.h ?? 10,
      service_type_id: this.resolveServiceTypeId(
        fulfillment.carrier?.code ?? null
      ),
      payment_type_id: 1, // Shop trả phí vận chuyển
      required_note: DEFAULT_REQUIRED_NOTE,
      client_order_code: orderId.slice(0, 50), // GHN max 50 chars
      cod_amount: 0, // Đã thanh toán online
      items: [
        {
          name: `Đơn hàng ${orderId}`,
          quantity: 1,
          weight: weightGrams
        }
      ]
    }

    // Tạo đơn GHN
    const created = await this.ghn.createOrder(ghnOrderInput)

    const trackingUrl = GHN_TRACKING_URL_TEMPLATE.replace(
      '{order_code}',
      created.order_code
    )
    const costVnd = parseInt(created.total_fee, 10) || 0

    const updated = await this.fulfillmentRepo.updateLabel(fulfillment.id, {
      ghnOrderCode: created.order_code,
      ghnServiceId: String(ghnOrderInput.service_type_id),
      labelUrl: trackingUrl, // GHN tracking URL (không có label PDF)
      labelPdfUrl: null,
      labelZplUrl: null,
      trackingNumber: created.order_code,
      trackingUrl,
      labelCostCents: costVnd, // GHN dùng VND không phải cents — lưu nguyên
      fulfillStatus: FulfillmentStatus.LABEL_BOOKED,
      labelBookedAt: new Date()
    })

    // Update status
    await this.fulfillmentRepo.updateStatus(
      fulfillment.id,
      FulfillmentStatus.LABEL_BOOKED
    )

    this.logger.log(
      `GHN order tạo thành công: orderId=${orderId}, ` +
        `order_code=${created.order_code}, ` +
        `phí=${costVnd}đ, ` +
        `dự kiến giao: ${created.expected_delivery_time}`
    )

    return (await this.fulfillmentRepo.findById(updated.id))!
  }

  /**
   * handleGHNWebhook — Xử lý tracking update từ GHN webhook.
   *
   * Flow:
   * 1. Verify webhook token
   * 2. Parse payload
   * 3. Find FulfillmentOrder bằng GHN order_code (= trackingNumber)
   * 4. Map GHN status → FulfillmentStatus
   * 5. Append TrackingEvent (immutable log)
   * 6. Update FulfillmentOrder status
   * 7. Publish SSE event
   *
   * Idempotent: nếu status không đổi → skip update (tránh duplicate events).
   *
   * @param rawBody - Buffer raw request body
   * @param webhookToken - Token từ header X-GHN-Token hoặc query param
   */
  async handleGHNWebhook(rawBody: Buffer, webhookToken: string): Promise<void> {
    // Step 1: Verify token TRƯỚC KHI xử lý bất kỳ gì
    if (!this.ghn.verifyWebhookToken(webhookToken)) {
      throw new Error('GHN webhook token verification thất bại')
    }

    // Step 2: Parse payload
    const payload = this.ghn.parseWebhookPayload(rawBody)

    // Chỉ xử lý status updates — bỏ qua create/update_weight/update_cod/update_fee
    if (payload.Type !== 'switch_status' && payload.Type !== 'create') {
      return
    }

    const ghnOrderCode = payload.OrderCode
    const ghnStatus = payload.Status

    if (!ghnOrderCode) return

    // Step 3: Find fulfillment order bằng GHN order_code (lưu trong trackingNumber)
    const fulfillment = await this.fulfillmentRepo.findByTrackingNumber(
      ghnOrderCode
    )
    if (!fulfillment) {
      this.logger.warn(
        `GHN Webhook: không tìm thấy FulfillmentOrder cho order_code=${ghnOrderCode}`
      )
      return
    }

    // Step 4: Map GHN status → FulfillmentStatus
    const newStatus = this.mapGHNStatus(ghnStatus)

    // Step 5: Append tracking event (always — immutable audit log)
    await this.fulfillmentRepo.createTrackingEvent({
      fulfillmentId: fulfillment.id,
      carrierStatus: ghnStatus,
      description: payload.Description || ghnStatus,
      location: payload.ToAddress || null,
      occurredAt: payload.Time ? new Date(payload.Time * 1000) : new Date(),
      sourcePayload: payload as unknown as object
    })

    // Step 6: Update status chỉ khi thay đổi (tránh unnecessary DB writes)
    if (newStatus && newStatus !== fulfillment.fulfillStatus) {
      const extraData: Parameters<typeof this.fulfillmentRepo.updateStatus>[2] =
        {}

      if (newStatus === FulfillmentStatus.SHIPPED) {
        extraData.shippedAt = new Date()
      } else if (newStatus === FulfillmentStatus.DELIVERED) {
        extraData.deliveredAt = new Date()
      } else if (newStatus === FulfillmentStatus.EXCEPTION) {
        extraData.exceptionAt = new Date()
        extraData.exceptionReason =
          payload.Reason || payload.Description || 'GHN exception'
      }

      await this.fulfillmentRepo.updateStatus(
        fulfillment.id,
        newStatus,
        extraData
      )

      this.logger.log(
        `GHN tracking update: order_code=${ghnOrderCode}, ` +
          `${fulfillment.fulfillStatus} → ${newStatus} (GHN: ${ghnStatus})`
      )

      // Notify customer khi đơn được vận chuyển hoặc giao thành công
      if (
        newStatus === FulfillmentStatus.IN_TRANSIT ||
        newStatus === FulfillmentStatus.DELIVERED
      ) {
        const notifyType =
          newStatus === FulfillmentStatus.IN_TRANSIT
            ? NotificationType.ORDER_SHIPPED
            : NotificationType.ORDER_DELIVERED

        const participants = await this.fulfillmentRepo.findOrderParticipants(
          fulfillment.orderId
        )
        if (participants) {
          this.notifyCustomer(
            participants.customerId,
            notifyType,
            fulfillment.orderId
          )
        }
      }
    }

    // Step 7: Publish SSE (fire-and-forget — không block webhook response)
    this.publishTrackingEvent(
      fulfillment.id,
      ghnOrderCode,
      ghnStatus,
      newStatus
    )
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * validateVNAddressSafe — Validate địa chỉ VN bằng GHN ward data.
   *
   * Kiểm tra ward_code có tồn tại trong district_id không.
   * Không throw — trả về valid=true nếu API lỗi (tránh block fulfillment init).
   */
  private async validateVNAddressSafe(rawAddress: string): Promise<{
    valid: boolean
    normalized: object | null
    error: string | null
  }> {
    try {
      const parsed = this.parseVNAddress(rawAddress)

      // Validate ward belongs to district
      const isValid = await this.ghnAddress.validateWardCode(
        parsed.to_ward_code,
        parsed.to_district_id
      )

      if (!isValid) {
        return {
          valid: false,
          normalized: null,
          error: `Phường/xã "${parsed.to_ward_code}" không thuộc quận/huyện ${parsed.to_district_id}`
        }
      }

      return {
        valid: true,
        normalized: parsed as unknown as object,
        error: null
      }
    } catch (err: unknown) {
      if (err instanceof GHNError) {
        this.logger.warn(
          `GHN address validation API lỗi (tiếp tục): [${err.code}] ${err.message}`
        )
        return { valid: true, normalized: null, error: null }
      }

      if (err instanceof SyntaxError) {
        return {
          valid: false,
          normalized: null,
          error: 'shippingAddress phải là JSON hợp lệ với các trường GHN'
        }
      }

      const message = err instanceof Error ? err.message : String(err)
      return { valid: false, normalized: null, error: message }
    }
  }

  /**
   * parseVNAddress — Parse địa chỉ VN từ JSON string.
   *
   * Địa chỉ GHN phải là JSON với cấu trúc:
   * {
   *   "to_name": "Nguyễn Văn An",
   *   "to_phone": "0901234567",
   *   "to_address": "123 Nguyễn Huệ",
   *   "to_ward_code": "20314",
   *   "to_district_id": 1442
   * }
   *
   * Throws SyntaxError nếu không parse được hoặc thiếu field bắt buộc.
   */
  private parseVNAddress(raw: string): VNAddressInput {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      throw new SyntaxError(
        `shippingAddress không phải JSON hợp lệ: "${raw.slice(0, 80)}..."`
      )
    }

    const toName = String(parsed['to_name'] ?? parsed['name'] ?? '')
    const toPhone = String(parsed['to_phone'] ?? parsed['phone'] ?? '')
    const toAddress = String(
      parsed['to_address'] ?? parsed['address'] ?? parsed['street1'] ?? ''
    )
    const toWardCode = String(
      parsed['to_ward_code'] ?? parsed['ward_code'] ?? ''
    )
    const toDistrictId =
      typeof parsed['to_district_id'] === 'number'
        ? parsed['to_district_id']
        : parseInt(
            String(parsed['to_district_id'] ?? parsed['district_id'] ?? '0'),
            10
          )
    const toWardName = String(parsed['to_ward_name'] ?? '')
    const toDistrictName = String(parsed['to_district_name'] ?? '')
    const toProvinceName = String(
      parsed['to_province_name'] ?? parsed['province'] ?? ''
    )

    if (!toWardCode || !toDistrictId) {
      throw new SyntaxError(
        'shippingAddress thiếu trường bắt buộc: to_ward_code và to_district_id'
      )
    }

    return {
      to_name: toName || 'Người nhận',
      to_phone: toPhone,
      to_address: toAddress || 'Địa chỉ chi tiết',
      to_ward_code: toWardCode,
      to_district_id: toDistrictId,
      to_ward_name: toWardName,
      to_district_name: toDistrictName,
      to_province_name: toProvinceName
    }
  }

  private async getOrderShippingAddress(
    orderId: string
  ): Promise<{ shippingAddress: string }> {
    const shippingAddress = await this.fulfillmentRepo.findOrderShippingAddress(
      orderId
    )
    if (!shippingAddress) {
      throw new NotFoundException(`Order ${orderId} không tìm thấy`)
    }
    return { shippingAddress }
  }

  /**
   * resolveServiceTypeId — Map carrier code sang GHN service_type_id.
   *
   * GHN service types:
   * - 2 = E-commerce (Express / Chuyển phát nhanh)
   * - 5 = Traditional (Eco / Tiết kiệm)
   *
   * Carrier code trong DB ví dụ: "GHN_EXPRESS", "GHN_ECO", "GHN"
   */
  private resolveServiceTypeId(
    carrierCode: string | null
  ): typeof DEFAULT_GHN_SERVICE_TYPE_ID | 5 {
    if (!carrierCode) return DEFAULT_GHN_SERVICE_TYPE_ID

    const upper = carrierCode.toUpperCase()
    if (upper.includes('ECO') || upper.includes('5')) return 5
    return DEFAULT_GHN_SERVICE_TYPE_ID
  }

  /**
   * mapGHNStatus — Map GHN tracking status → FulfillmentStatus.
   *
   * GHN statuses (từ webhook Type=switch_status):
   * https://api.ghn.vn/home/docs/detail?id=47
   */
  private mapGHNStatus(ghnStatus: string): FulfillmentStatus | null {
    const statusMap: Record<string, FulfillmentStatus> = {
      // Chờ lấy hàng
      ready_to_pick: FulfillmentStatus.LABEL_BOOKED,
      // Đang lấy hàng (map sang SHIPPED vì chưa có PICKED_UP status)
      picking: FulfillmentStatus.SHIPPED,
      picked: FulfillmentStatus.SHIPPED,
      // Đang vận chuyển
      storing: FulfillmentStatus.IN_TRANSIT,
      transporting: FulfillmentStatus.IN_TRANSIT,
      sorting: FulfillmentStatus.IN_TRANSIT,
      // Đang giao
      delivering: FulfillmentStatus.OUT_FOR_DELIVERY,
      // Đã giao thành công
      delivered: FulfillmentStatus.DELIVERED,
      // Giao thất bại / ngoại lệ
      delivery_fail: FulfillmentStatus.EXCEPTION,
      // Trả hàng
      return: FulfillmentStatus.EXCEPTION,
      return_transporting: FulfillmentStatus.EXCEPTION,
      return_sorting: FulfillmentStatus.EXCEPTION,
      return_transporting_to_return_sender: FulfillmentStatus.EXCEPTION,
      returned: FulfillmentStatus.EXCEPTION,
      // Huỷ / hỏng / mất
      cancel: FulfillmentStatus.EXCEPTION,
      damage: FulfillmentStatus.EXCEPTION,
      lost: FulfillmentStatus.EXCEPTION,
      // Chờ xem hàng
      waiting_to_return: FulfillmentStatus.EXCEPTION
    }

    return statusMap[ghnStatus.toLowerCase()] ?? null
  }

  private publishFulfillmentEvent(
    campaignId: string,
    payload: Record<string, unknown>
  ): void {
    void this.redis
      .publishDashboardEvent(campaignId, payload)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(`Không thể publish fulfillment event: ${msg}`)
      })
  }

  private publishTrackingEvent(
    fulfillmentId: string,
    trackingCode: string,
    ghnStatus: string,
    newStatus: FulfillmentStatus | null
  ): void {
    void this.redis
      .publishDashboardEvent('fulfillment', {
        type: 'TRACKING_UPDATE',
        fulfillmentId,
        trackingCode,
        carrierStatus: ghnStatus,
        fulfillmentStatus: newStatus,
        timestamp: new Date().toISOString()
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(`Không thể publish tracking event: ${msg}`)
      })
  }

  /** Fire-and-forget — không throw nếu notification fail */
  private notifyMerchantQcRequired(
    merchantUserId: string,
    orderId: string
  ): void {
    void this.notificationService
      .createNotification(merchantUserId, {
        type: NotificationType.QC_REQUIRED,
        title: 'Đơn hàng mới cần kiểm định chất lượng',
        message: `Đơn hàng ${orderId} đã được xác nhận và đang chờ QC. Vui lòng kiểm định trước khi giao.`
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(
          `Không thể notify merchant QC_REQUIRED cho order ${orderId}: ${msg}`
        )
      })
  }

  /** Fire-and-forget — không throw nếu notification fail */
  private notifyCustomer(
    customerId: string,
    type: NotificationType,
    orderId: string
  ): void {
    const [title, message] =
      type === NotificationType.ORDER_SHIPPED
        ? [
            'Đơn hàng đang trên đường giao',
            `Đơn hàng ${orderId} đã được bàn giao cho GHN và đang trên đường đến bạn.`
          ]
        : [
            'Đơn hàng đã giao thành công',
            `Đơn hàng ${orderId} đã được giao thành công. Cảm ơn bạn đã tin tưởng mua sắm!`
          ]

    void this.notificationService
      .createNotification(customerId, { type, title, message })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(
          `Không thể notify customer ${type} cho order ${orderId}: ${msg}`
        )
      })
  }
}
