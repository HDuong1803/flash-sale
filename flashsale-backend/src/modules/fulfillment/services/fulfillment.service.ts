import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { FulfillmentStatus, NotificationType } from '@prisma/client'
import { EasyPostService } from '@infrastructure/easypost/easypost.service'
import { EasyPostError } from '@infrastructure/easypost/easypost.types'
import { RedisService } from '@infrastructure/redis/redis.service'
import { NotificationService } from '@modules/notification/services/notification.service'
import {
  FulfillmentRepository,
  FulfillmentOrderWithCarrier
} from '../repositories/fulfillment.repository'
import { QcRepository } from '../repositories/qc.repository'
import { FulfillmentRulesEngine } from './fulfillment-rules.engine'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Từ kho hàng mặc định (San Francisco, CA) — dùng khi không config warehouse address */
const DEFAULT_FROM_ADDRESS = {
  company: 'Flash Sale Warehouse',
  street1: '1 Market St',
  city: 'San Francisco',
  state: 'CA',
  zip: '94105',
  country: 'US',
  phone: '4155551234'
}

/** Default parcel dimensions khi không có thông tin (oz conversion: 1g ≈ 0.0353 oz) */
const GRAMS_TO_OZ = 0.0353274

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InitializeFulfillmentInput {
  orderId: string
  shippingAddress: string
  /** Total order amount in USD (Decimal string from Prisma) */
  totalAmount: string
  /** merchantId để route về đúng merchant */
  merchantId: string
  /** campaignId để publish SSE event */
  campaignId: string
}

export interface BookLabelInput {
  orderId: string
  /** Weight in grams (default: 500g if not provided) */
  weightGrams?: number
  /** Dimensions in centimeters */
  dimensionsCm?: { l: number; w: number; h: number }
}

/**
 * FulfillmentService — Orchestrates the entire fulfillment lifecycle.
 *
 * Responsibilities:
 * - initializeFulfillment: trigger khi order CONFIRMED (fire-and-forget từ saga)
 * - bookLabel: gọi khi QC pass — mua label từ EasyPost
 * - handleTrackingWebhook: xử lý tracking update từ EasyPost webhook
 *
 * Design decisions:
 * - initializeFulfillment là fire-and-forget: không throw nếu lỗi, chỉ log.
 *   Reason: không được làm fail payment saga vì fulfillment là side-effect.
 * - bookLabel có thể retry: idempotent check qua easypostShipmentId.
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
    private readonly easypost: EasyPostService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService
  ) {}

  /**
   * initializeFulfillment — Tạo FulfillmentOrder ngay sau khi Order confirmed.
   *
   * Flow:
   * 1. Validate address với EasyPost
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
          `FulfillmentOrder already exists for order ${orderId}, skipping init`
        )
        return
      }

      // Step 1: Load rules (batch, không N+1)
      const rules = await this.fulfillmentRepo.findActiveRules()

      // Step 2: Validate address + evaluate rules concurrently
      const totalCents = Math.round(parseFloat(totalAmount) * 100)
      const ctx = this.rulesEngine.buildContext({
        orderTotalCents: totalCents,
        shippingAddress
      })

      const [addressResult, decision] = await Promise.all([
        this.validateAddressSafe(shippingAddress),
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
          `No fulfillment rule matched for order ${orderId} (${noMatchReason}). ` +
            'FulfillmentOrder created without carrier assignment.'
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
        `initializeFulfillment failed for order ${orderId}: ${message}`
      )
    }
  }

  /**
   * bookLabel — Mua shipping label từ EasyPost.
   *
   * Flow:
   * 1. Load FulfillmentOrder (phải tồn tại)
   * 2. Idempotency: nếu đã có label → return existing
   * 3. Tạo shipment trong EasyPost (address + parcel)
   * 4. Select rate theo carrier rule
   * 5. Buy label
   * 6. Update DB + publish SSE
   *
   * Throws NotFoundException nếu order không tồn tại.
   * Throws EasyPostError nếu EasyPost API lỗi (caller xử lý retry).
   */
  async bookLabel(input: BookLabelInput): Promise<FulfillmentOrderWithCarrier> {
    const { orderId, weightGrams = 500, dimensionsCm } = input

    // Fetch order + fulfillment details via Prisma join
    const fulfillment = await this.fulfillmentRepo.findByOrderId(orderId)
    if (!fulfillment) {
      throw new NotFoundException(
        `FulfillmentOrder không tìm thấy cho order ${orderId}`
      )
    }

    // Idempotency: label đã booked → trả về existing
    if (
      fulfillment.labelUrl &&
      fulfillment.fulfillStatus !== FulfillmentStatus.AWAITING
    ) {
      this.logger.debug(`Label already booked for order ${orderId}`)
      return fulfillment
    }

    // Cannot book label for ADDRESS_ISSUE orders
    if (fulfillment.fulfillStatus === FulfillmentStatus.ADDRESS_ISSUE) {
      throw new Error(
        `Không thể book label: địa chỉ giao hàng không hợp lệ cho order ${orderId}`
      )
    }

    // Get order details (raw shippingAddress)
    const orderData = await this.getOrderShippingAddress(orderId)

    // Build parcel (convert grams → oz for EasyPost)
    const weightOz = Math.max(0.1, weightGrams * GRAMS_TO_OZ)
    const parcel = dimensionsCm
      ? {
          weight: weightOz,
          // cm → inches (1 cm = 0.3937 inches)
          length: Math.ceil(dimensionsCm.l * 0.3937),
          width: Math.ceil(dimensionsCm.w * 0.3937),
          height: Math.ceil(dimensionsCm.h * 0.3937)
        }
      : { weight: weightOz }

    // Parse toAddress
    const toAddress = this.parseShippingAddress(orderData.shippingAddress)

    // Create EasyPost shipment
    const shipment = await this.easypost.createShipment(
      DEFAULT_FROM_ADDRESS,
      toAddress,
      parcel
    )

    // Select best rate for carrier
    let selectedRate = fulfillment.carrier
      ? this.easypost.selectRateForCarrier(
          shipment.rates,
          fulfillment.carrier.code
        )
      : null

    // Fallback: cheapest available rate
    if (!selectedRate && shipment.rates.length > 0) {
      selectedRate =
        shipment.rates.sort(
          (a, b) => parseFloat(a.rate) - parseFloat(b.rate)
        )[0] ?? null
      this.logger.warn(
        `Preferred carrier rate not available for order ${orderId}, using cheapest: ` +
          `${selectedRate?.carrier} ${selectedRate?.service}`
      )
    }

    if (!selectedRate) {
      throw new Error(`No shipping rates available for order ${orderId}`)
    }

    // Purchase label
    const purchased = await this.easypost.buyLabel(shipment.id, selectedRate.id)

    const label = purchased.postage_label
    if (!label?.label_url) {
      throw new Error(`EasyPost did not return label URL for order ${orderId}`)
    }

    const costCents = Math.round(parseFloat(selectedRate.rate) * 100)

    // Persist
    const updated = await this.fulfillmentRepo.updateLabel(fulfillment.id, {
      easypostShipmentId: shipment.id,
      easypostRateId: selectedRate.id,
      labelUrl: label.label_url,
      labelPdfUrl: label.label_pdf_url ?? null,
      labelZplUrl: label.label_zpl_url ?? null,
      trackingNumber: purchased.tracking_code ?? '',
      trackingUrl: purchased.tracker?.public_url ?? null,
      labelCostCents: costCents,
      fulfillStatus: FulfillmentStatus.LABEL_BOOKED,
      labelBookedAt: new Date()
    })

    // Update weight/dimensions
    await this.fulfillmentRepo.updateStatus(
      fulfillment.id,
      FulfillmentStatus.LABEL_BOOKED
    )

    this.logger.log(
      `Label booked: order=${orderId}, tracking=${purchased.tracking_code}, ` +
        `carrier=${selectedRate.carrier} ${selectedRate.service}, cost=$${selectedRate.rate}`
    )

    return (await this.fulfillmentRepo.findById(updated.id))!
  }

  /**
   * handleTrackingWebhook — Xử lý tracking update từ EasyPost.
   *
   * Flow:
   * 1. Verify HMAC signature
   * 2. Parse payload
   * 3. Find FulfillmentOrder bằng tracking_code
   * 4. Map carrier status → FulfillmentStatus
   * 5. Append TrackingEvent (immutable log)
   * 6. Update FulfillmentOrder status
   * 7. Publish SSE event
   *
   * Idempotent: nếu status không đổi → skip update (tránh duplicate events).
   */
  async handleTrackingWebhook(
    rawBody: Buffer,
    signatureHeader: string
  ): Promise<void> {
    // Step 1: Verify signature TRƯỚC KHI xử lý bất kỳ gì
    if (!this.easypost.verifyWebhookSignature(rawBody, signatureHeader)) {
      throw new Error('EasyPost webhook signature verification failed')
    }

    // Step 2: Parse payload
    const payload = this.easypost.parseWebhookPayload(rawBody)

    // Only handle tracker events
    if (!payload.description.startsWith('tracker.')) {
      return
    }

    const trackingCode = payload.result.tracking_code
    const carrierStatus = payload.result.status ?? 'unknown'

    if (!trackingCode) return

    // Step 3: Find fulfillment order
    const fulfillment = await this.fulfillmentRepo.findByTrackingNumber(
      trackingCode
    )
    if (!fulfillment) {
      this.logger.warn(
        `Tracking webhook: no FulfillmentOrder found for tracking_code=${trackingCode}`
      )
      return
    }

    // Step 4: Map carrier status → FulfillmentStatus
    const newStatus = this.mapCarrierStatus(carrierStatus)

    // Step 5: Append tracking event (always — immutable audit log)
    const latestDetail = payload.result.tracking_details?.[0]
    await this.fulfillmentRepo.createTrackingEvent({
      fulfillmentId: fulfillment.id,
      carrierStatus,
      description: latestDetail?.message ?? payload.description,
      location: latestDetail?.tracking_location
        ? `${latestDetail.tracking_location.city ?? ''}, ${
            latestDetail.tracking_location.state ?? ''
          }`.trim()
        : null,
      occurredAt: latestDetail?.datetime
        ? new Date(latestDetail.datetime)
        : new Date(payload.updated_at),
      sourcePayload: payload as unknown as object
    })

    // Step 6: Update status only if it changed (avoid unnecessary DB writes)
    if (newStatus && newStatus !== fulfillment.fulfillStatus) {
      const extraData: Parameters<typeof this.fulfillmentRepo.updateStatus>[2] =
        {}

      if (newStatus === FulfillmentStatus.SHIPPED) {
        extraData.shippedAt = new Date()
      } else if (newStatus === FulfillmentStatus.DELIVERED) {
        extraData.deliveredAt = new Date()
      } else if (newStatus === FulfillmentStatus.EXCEPTION) {
        extraData.exceptionAt = new Date()
        extraData.exceptionReason = latestDetail?.message ?? 'Carrier exception'
      }

      await this.fulfillmentRepo.updateStatus(
        fulfillment.id,
        newStatus,
        extraData
      )

      this.logger.log(
        `Tracking update: tracking=${trackingCode}, ` +
          `${fulfillment.fulfillStatus} → ${newStatus}`
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
      trackingCode,
      carrierStatus,
      newStatus
    )
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async validateAddressSafe(rawAddress: string): Promise<{
    valid: boolean
    normalized: object | null
    error: string | null
  }> {
    try {
      const input = this.parseShippingAddress(rawAddress)
      const result = await this.easypost.createAndVerifyAddress({
        ...input,
        verify: true
      })

      const delivery = result.verifications?.delivery
      const valid = delivery?.success ?? true // Nếu không có verification, assume valid

      if (!valid) {
        const errorMsg =
          delivery?.errors?.[0]?.message ?? 'Address not deliverable'
        return { valid: false, normalized: null, error: errorMsg }
      }

      return {
        valid: true,
        normalized: result as unknown as object,
        error: null
      }
    } catch (err: unknown) {
      if (err instanceof EasyPostError) {
        this.logger.warn(
          `Address validation API error (will proceed): [${err.code}] ${err.message}`
        )
        // EasyPost API lỗi không được block fulfillment init
        return { valid: true, normalized: null, error: null }
      }
      const message = err instanceof Error ? err.message : String(err)
      return { valid: false, normalized: null, error: message }
    }
  }

  private parseShippingAddress(raw: string): {
    name?: string
    street1: string
    street2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
    phone?: string
  } {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      return {
        name: parsed['name'],
        street1: parsed['street1'] ?? parsed['address'] ?? raw,
        street2: parsed['street2'],
        city: parsed['city'],
        state: parsed['state'],
        zip: parsed['zip'] ?? parsed['zipCode'] ?? parsed['postal_code'],
        country: parsed['country'] ?? 'US',
        phone: parsed['phone']
      }
    } catch {
      // Free text → send as street1 and let EasyPost parse
      return { street1: raw, country: 'US' }
    }
  }

  private async getOrderShippingAddress(
    orderId: string
  ): Promise<{ shippingAddress: string }> {
    const shippingAddress = await this.fulfillmentRepo.findOrderShippingAddress(
      orderId
    )
    if (!shippingAddress) {
      throw new NotFoundException(`Order ${orderId} not found`)
    }
    return { shippingAddress }
  }

  /**
   * mapCarrierStatus — Map EasyPost tracker status → FulfillmentStatus.
   *
   * EasyPost statuses: https://docs.easypost.com/docs/trackers#tracker-statuses
   */
  private mapCarrierStatus(carrierStatus: string): FulfillmentStatus | null {
    const statusMap: Record<string, FulfillmentStatus> = {
      pre_transit: FulfillmentStatus.LABEL_BOOKED,
      in_transit: FulfillmentStatus.IN_TRANSIT,
      out_for_delivery: FulfillmentStatus.OUT_FOR_DELIVERY,
      delivered: FulfillmentStatus.DELIVERED,
      available_for_pickup: FulfillmentStatus.OUT_FOR_DELIVERY,
      return_to_sender: FulfillmentStatus.EXCEPTION,
      failure: FulfillmentStatus.EXCEPTION,
      error: FulfillmentStatus.EXCEPTION,
      unknown: FulfillmentStatus.IN_TRANSIT
    }

    return statusMap[carrierStatus.toLowerCase()] ?? null
  }

  private publishFulfillmentEvent(
    campaignId: string,
    payload: Record<string, unknown>
  ): void {
    void this.redis
      .publishDashboardEvent(campaignId, payload)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(`Failed to publish fulfillment event: ${msg}`)
      })
  }

  private publishTrackingEvent(
    fulfillmentId: string,
    trackingCode: string,
    carrierStatus: string,
    newStatus: FulfillmentStatus | null
  ): void {
    void this.redis
      .publishDashboardEvent('fulfillment', {
        type: 'TRACKING_UPDATE',
        fulfillmentId,
        trackingCode,
        carrierStatus,
        fulfillmentStatus: newStatus,
        timestamp: new Date().toISOString()
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(`Failed to publish tracking event: ${msg}`)
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
          `Failed to notify merchant QC_REQUIRED for order ${orderId}: ${msg}`
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
            `Đơn hàng ${orderId} đã được bàn giao cho đơn vị vận chuyển và đang trên đường đến bạn.`
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
          `Failed to notify customer ${type} for order ${orderId}: ${msg}`
        )
      })
  }
}
