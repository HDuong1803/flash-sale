import { Injectable } from '@nestjs/common'
import {
  Carrier,
  FulfillmentOrder,
  FulfillmentRule,
  FulfillmentStatus,
  TrackingEvent
} from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FulfillmentRuleWithCarrier = FulfillmentRule & {
  carrier: Carrier
}

export type FulfillmentOrderWithCarrier = FulfillmentOrder & {
  carrier: Carrier | null
  trackingEvents: TrackingEvent[]
}

export interface CreateFulfillmentOrderInput {
  orderId: string
  carrierId: string | null
  slaHours: number | null
  slaDeadline: Date | null
  addressValidated: boolean
  normalizedAddress: object | null
}

export interface UpdateFulfillmentLabelInput {
  ghnOrderCode: string
  ghnServiceId: string
  labelUrl: string
  labelPdfUrl: string | null
  labelZplUrl: string | null
  trackingNumber: string
  trackingUrl: string | null
  labelCostCents: number
  fulfillStatus: FulfillmentStatus
  labelBookedAt: Date
}

export interface FulfillmentOrderAccessContext {
  customerId: string
  merchantUserId: string | null
}

@Injectable()
export class FulfillmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Carriers ──────────────────────────────────────────────────────────────

  async findAllCarriers(): Promise<Carrier[]> {
    return this.prisma.carrier.findMany({
      orderBy: { code: 'asc' }
    })
  }

  async findAllActiveCarriers(): Promise<Carrier[]> {
    return this.prisma.carrier.findMany({
      where: { active: true },
      orderBy: { code: 'asc' }
    })
  }

  async findCarrierById(id: string): Promise<Carrier | null> {
    return this.prisma.carrier.findUnique({ where: { id } })
  }

  async updateCarrierActive(id: string, active: boolean): Promise<Carrier> {
    return this.prisma.carrier.update({
      where: { id },
      data: { active }
    })
  }

  // ─── Rules ─────────────────────────────────────────────────────────────────

  /**
   * findActiveRules — Lấy tất cả active rules, sort priority DESC (cao nhất trước).
   * Được cache trong FulfillmentRulesEngine — không gọi per-request.
   */
  async findActiveRules(): Promise<FulfillmentRuleWithCarrier[]> {
    return this.prisma.fulfillmentRule.findMany({
      where: { active: true },
      include: { carrier: true },
      orderBy: { priority: 'desc' }
    })
  }

  async findRuleById(id: string): Promise<FulfillmentRuleWithCarrier | null> {
    return this.prisma.fulfillmentRule.findUnique({
      where: { id },
      include: { carrier: true }
    })
  }

  async createRule(data: {
    name: string
    priority: number
    minWeightGrams?: number | null
    maxWeightGrams?: number | null
    minOrderCents?: number | null
    maxOrderCents?: number | null
    destCountry?: string | null
    destState?: string | null
    carrierId: string
    slaHours: number
  }): Promise<FulfillmentRuleWithCarrier> {
    return this.prisma.fulfillmentRule.create({
      data,
      include: { carrier: true }
    })
  }

  async deactivateRule(id: string): Promise<FulfillmentRule> {
    return this.prisma.fulfillmentRule.update({
      where: { id },
      data: { active: false }
    })
  }

  // ─── FulfillmentOrder ──────────────────────────────────────────────────────

  async createFulfillmentOrder(
    input: CreateFulfillmentOrderInput
  ): Promise<FulfillmentOrder> {
    return this.prisma.fulfillmentOrder.create({ data: input })
  }

  async findByOrderId(
    orderId: string
  ): Promise<FulfillmentOrderWithCarrier | null> {
    return this.prisma.fulfillmentOrder.findUnique({
      where: { orderId },
      include: {
        carrier: true,
        trackingEvents: {
          orderBy: { occurredAt: 'desc' },
          take: 20
        }
      }
    })
  }

  async findOrderAccessContext(
    orderId: string
  ): Promise<FulfillmentOrderAccessContext | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customerId: true,
        merchant: {
          select: {
            userId: true
          }
        }
      }
    })

    if (!order) return null
    return {
      customerId: order.customerId,
      merchantUserId: order.merchant.userId
    }
  }

  async findOrderShippingAddress(orderId: string): Promise<string | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { shippingAddress: true }
    })
    return order?.shippingAddress ?? null
  }

  /**
   * findOrderParticipants — Lấy customerId và merchantUserId từ orderId.
   * Dùng để gửi notification khi tracking update xảy ra.
   */
  async findOrderParticipants(orderId: string): Promise<{
    customerId: string
    merchantUserId: string | null
  } | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customerId: true,
        merchant: { select: { userId: true } }
      }
    })
    if (!order) return null
    return {
      customerId: order.customerId,
      merchantUserId: order.merchant.userId
    }
  }

  async findById(id: string): Promise<FulfillmentOrderWithCarrier | null> {
    return this.prisma.fulfillmentOrder.findUnique({
      where: { id },
      include: {
        carrier: true,
        trackingEvents: { orderBy: { occurredAt: 'desc' } }
      }
    })
  }

  async findByTrackingNumber(
    trackingNumber: string
  ): Promise<FulfillmentOrder | null> {
    return this.prisma.fulfillmentOrder.findUnique({
      where: { trackingNumber }
    })
  }

  async findActiveShippingOrders(): Promise<
    Pick<
      FulfillmentOrder,
      'id' | 'trackingNumber' | 'fulfillStatus' | 'orderId'
    >[]
  > {
    return this.prisma.fulfillmentOrder.findMany({
      where: {
        fulfillStatus: {
          in: [
            FulfillmentStatus.LABEL_BOOKED,
            FulfillmentStatus.SHIPPED,
            FulfillmentStatus.IN_TRANSIT,
            FulfillmentStatus.OUT_FOR_DELIVERY
          ]
        },
        trackingNumber: { not: null }
      },
      select: {
        id: true,
        trackingNumber: true,
        fulfillStatus: true,
        orderId: true
      }
    })
  }

  async updateLabel(
    id: string,
    data: UpdateFulfillmentLabelInput
  ): Promise<FulfillmentOrder> {
    return this.prisma.fulfillmentOrder.update({ where: { id }, data })
  }

  async updateStatus(
    id: string,
    fulfillStatus: FulfillmentStatus,
    extraData?: Partial<
      Pick<
        FulfillmentOrder,
        | 'shippedAt'
        | 'deliveredAt'
        | 'exceptionAt'
        | 'exceptionReason'
        | 'slaBreached'
        | 'slaBreachedAt'
      >
    >
  ): Promise<FulfillmentOrder> {
    return this.prisma.fulfillmentOrder.update({
      where: { id },
      data: { fulfillStatus, ...extraData }
    })
  }

  async updateAddressIssue(
    id: string,
    reason: string
  ): Promise<FulfillmentOrder> {
    return this.prisma.fulfillmentOrder.update({
      where: { id },
      data: {
        fulfillStatus: FulfillmentStatus.ADDRESS_ISSUE,
        exceptionReason: reason
      }
    })
  }

  /**
   * findPendingQcOrders — Tìm FulfillmentOrders đang AWAITING/ADDRESS_ISSUE cần xử lý.
   *
   * Trả về cả orders chưa có QC checkpoint lẫn orders đang trong QC (PENDING/REWORK).
   * @param merchantUserId - nếu có → chỉ trả về orders của merchant đó; không có → tất cả (Admin)
   */
  async findPendingQcOrders(merchantUserId?: string): Promise<
    Array<{
      orderId: string
      fulfillStatus: FulfillmentStatus
      slaDeadline: Date | null
      slaBreached: boolean
      carrier: { code: string; displayName: string } | null
      order: {
        totalAmount: { toString(): string }
        createdAt: Date
        _count: { items: number }
        qcCheckpoint: {
          status: string
          inspector: {
            id: string
            email: string
            fullName: string | null
          } | null
        } | null
      }
    }>
  > {
    return this.prisma.fulfillmentOrder.findMany({
      where: {
        fulfillStatus: {
          in: [FulfillmentStatus.AWAITING, FulfillmentStatus.ADDRESS_ISSUE]
        },
        ...(merchantUserId
          ? { order: { merchant: { userId: merchantUserId } } }
          : {})
      },
      select: {
        orderId: true,
        fulfillStatus: true,
        slaDeadline: true,
        slaBreached: true,
        carrier: { select: { code: true, displayName: true } },
        order: {
          select: {
            totalAmount: true,
            createdAt: true,
            _count: { select: { items: true } },
            qcCheckpoint: {
              select: {
                status: true,
                inspector: { select: { id: true, email: true, fullName: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
  }

  /**
   * findBreachedOrders — Tìm orders đã vi phạm SLA (deadline < now) chưa được mark.
   * Dùng bởi SLA scheduler để mark và alert.
   */
  async findBreachedOrders(now: Date): Promise<FulfillmentOrder[]> {
    const terminalStatuses = [
      FulfillmentStatus.DELIVERED,
      FulfillmentStatus.CANCELLED,
      FulfillmentStatus.EXCEPTION
    ]
    return this.prisma.fulfillmentOrder.findMany({
      where: {
        slaDeadline: { lt: now },
        slaBreached: false,
        fulfillStatus: { notIn: terminalStatuses }
      },
      orderBy: { slaDeadline: 'asc' }
    })
  }

  /**
   * findOrdersApproachingSlaDeadline — Tìm orders chưa breach và sắp hết SLA trong window.
   * now < slaDeadline < windowEnd — cảnh báo trước khi vi phạm xảy ra.
   *
   * @param windowMs - khoảng thời gian cảnh báo (ms), e.g. 2 * 60 * 60 * 1000 (2 giờ)
   */
  async findOrdersApproachingSlaDeadline(
    windowMs: number
  ): Promise<FulfillmentOrder[]> {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + windowMs)
    const terminalStatuses = [
      FulfillmentStatus.DELIVERED,
      FulfillmentStatus.CANCELLED,
      FulfillmentStatus.EXCEPTION
    ]
    return this.prisma.fulfillmentOrder.findMany({
      where: {
        slaDeadline: { gt: now, lte: windowEnd },
        slaBreached: false,
        fulfillStatus: { notIn: terminalStatuses }
      },
      orderBy: { slaDeadline: 'asc' }
    })
  }

  async markSlaBreached(id: string): Promise<FulfillmentOrder> {
    return this.prisma.fulfillmentOrder.update({
      where: { id },
      data: { slaBreached: true, slaBreachedAt: new Date() }
    })
  }

  /** markSlaBreachedBatch — Batch update nhiều orders cùng lúc (1 query). */
  async markSlaBreachedBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.prisma.fulfillmentOrder.updateMany({
      where: { id: { in: ids } },
      data: { slaBreached: true, slaBreachedAt: new Date() }
    })
  }

  // ─── TrackingEvents ────────────────────────────────────────────────────────

  async createTrackingEvent(data: {
    fulfillmentId: string
    carrierStatus: string
    description?: string | null
    location?: string | null
    occurredAt: Date
    sourcePayload: object
  }): Promise<TrackingEvent> {
    return this.prisma.trackingEvent.create({ data })
  }

  /**
   * findLatestTrackingStatus — Lấy carrier status mới nhất của fulfillment.
   * Dùng để check xem có cần update FulfillmentOrder.fulfillStatus không.
   */
  async findLatestTrackingStatus(
    fulfillmentId: string
  ): Promise<string | null> {
    const event = await this.prisma.trackingEvent.findFirst({
      where: { fulfillmentId },
      orderBy: { occurredAt: 'desc' },
      select: { carrierStatus: true }
    })
    return event?.carrierStatus ?? null
  }

  async findMerchantProfileByUserId(
    userId: string
  ): Promise<{ id: string } | null> {
    return this.prisma.merchantProfile.findUnique({
      where: { userId },
      select: { id: true }
    })
  }
}
