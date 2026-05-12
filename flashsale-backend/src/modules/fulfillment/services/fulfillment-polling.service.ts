import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import {
  FulfillmentStatus,
  NotificationType,
  OrderStatus
} from '@prisma/client'
import { GHNService } from '@infrastructure/ghn/ghn.service'
import { GHNError } from '@infrastructure/ghn/ghn.types'
import { NotificationService } from '@modules/notification/services/notification.service'
import { FulfillmentRepository } from '../repositories/fulfillment.repository'

/**
 * FulfillmentPollingService — Đồng bộ trạng thái vận chuyển từ GHN.
 *
 * Dùng khi không có webhook: định kỳ gọi GHN API để kiểm tra trạng thái
 * các đơn đang vận chuyển và tự động cập nhật DB.
 */
@Injectable()
export class FulfillmentPollingService {
  private readonly logger = new Logger(FulfillmentPollingService.name)
  private isRunning = false

  private static readonly GHN_STATUS_MAP: Record<string, FulfillmentStatus> = {
    ready_to_pick: FulfillmentStatus.LABEL_BOOKED,
    picking: FulfillmentStatus.SHIPPED,
    picked: FulfillmentStatus.SHIPPED,
    storing: FulfillmentStatus.IN_TRANSIT,
    transporting: FulfillmentStatus.IN_TRANSIT,
    sorting: FulfillmentStatus.IN_TRANSIT,
    delivering: FulfillmentStatus.OUT_FOR_DELIVERY,
    delivered: FulfillmentStatus.DELIVERED,
    delivery_fail: FulfillmentStatus.EXCEPTION,
    return: FulfillmentStatus.EXCEPTION,
    return_transporting: FulfillmentStatus.EXCEPTION,
    returned: FulfillmentStatus.EXCEPTION,
    cancel: FulfillmentStatus.EXCEPTION,
    damage: FulfillmentStatus.EXCEPTION,
    lost: FulfillmentStatus.EXCEPTION
  }

  // Các trạng thái fulfillment cần cập nhật Order.status → SHIPPING
  private static readonly SHIPPING_STATUSES = new Set<FulfillmentStatus>([
    FulfillmentStatus.SHIPPED,
    FulfillmentStatus.IN_TRANSIT,
    FulfillmentStatus.OUT_FOR_DELIVERY,
    FulfillmentStatus.DELIVERED
  ])

  constructor(
    private readonly fulfillmentRepo: FulfillmentRepository,
    private readonly ghn: GHNService,
    private readonly notificationService: NotificationService
  ) {}

  /** Chạy mỗi 5 phút — đồng bộ toàn hệ thống (không filter merchant) */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cronSyncAll(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Polling đang chạy, bỏ qua lần này')
      return
    }

    this.isRunning = true
    try {
      await this.runSync() // undefined = toàn hệ thống
    } finally {
      this.isRunning = false
    }
  }

  /** Trigger thủ công — merchantId giới hạn chỉ đơn của merchant đó, undefined = toàn hệ thống (ADMIN) */
  async triggerManualSync(
    merchantId?: string
  ): Promise<{ synced: number; errors: number }> {
    return this.runSync(merchantId)
  }

  private async runSync(
    merchantId?: string
  ): Promise<{ synced: number; errors: number }> {
    const orders = await this.fulfillmentRepo.findActiveShippingOrders(
      merchantId
    )

    if (orders.length === 0) {
      this.logger.debug('Không có đơn nào đang vận chuyển cần đồng bộ')
      return { synced: 0, errors: 0 }
    }

    this.logger.log(`Bắt đầu đồng bộ ${orders.length} đơn đang vận chuyển`)

    let synced = 0
    let errors = 0

    for (const order of orders) {
      if (!order.trackingNumber) continue

      try {
        await new Promise(resolve => setTimeout(resolve, 200)) // 200ms giữa mỗi call
        const detail = await this.ghn.getOrderDetail(order.trackingNumber)
        const ghnStatus = detail.status?.toLowerCase() ?? ''
        const newStatus =
          FulfillmentPollingService.GHN_STATUS_MAP[ghnStatus] ?? null

        if (!newStatus || newStatus === order.fulfillStatus) continue

        const extraData: Parameters<
          typeof this.fulfillmentRepo.updateStatus
        >[2] = {}
        if (newStatus === FulfillmentStatus.SHIPPED) {
          extraData.shippedAt = new Date()
        } else if (newStatus === FulfillmentStatus.DELIVERED) {
          extraData.deliveredAt = new Date()
        } else if (newStatus === FulfillmentStatus.EXCEPTION) {
          extraData.exceptionAt = new Date()
          extraData.exceptionReason = `GHN: ${detail.status}`
        }

        const needsOrderSync =
          FulfillmentPollingService.SHIPPING_STATUSES.has(newStatus)

        if (needsOrderSync) {
          await this.fulfillmentRepo.updateStatusWithOrderSync(
            order.id,
            order.orderId,
            newStatus,
            OrderStatus.SHIPPING,
            extraData
          )
        } else {
          await this.fulfillmentRepo.updateStatus(
            order.id,
            newStatus,
            extraData
          )
        }

        this.logger.log(
          `Sync: order=${order.orderId}, tracking=${order.trackingNumber}, ` +
            `${order.fulfillStatus} → ${newStatus} (GHN: ${detail.status})`
        )

        if (
          newStatus === FulfillmentStatus.IN_TRANSIT ||
          newStatus === FulfillmentStatus.DELIVERED
        ) {
          this.notifyCustomerAsync(order.orderId, newStatus)
        }

        synced++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)

        // GHN 400 = đơn không tồn tại / vĩnh viễn không tìm được → mark EXCEPTION,
        // loại khỏi polling queue để tránh spam lỗi mỗi chu kỳ
        if (err instanceof GHNError && err.httpStatus === 400) {
          try {
            await this.fulfillmentRepo.updateStatus(
              order.id,
              FulfillmentStatus.EXCEPTION,
              {
                exceptionAt: new Date(),
                exceptionReason: `GHN không tìm thấy: ${order.trackingNumber}`
              }
            )
            this.logger.warn(
              `tracking=${order.trackingNumber}: GHN 400 → đánh dấu EXCEPTION, dừng polling`
            )
          } catch {
            this.logger.warn(
              `Không thể sync tracking=${order.trackingNumber}: ${msg}`
            )
          }
        } else {
          this.logger.warn(
            `Không thể sync tracking=${order.trackingNumber}: ${msg}`
          )
        }

        errors++
      }
    }

    this.logger.log(`Đồng bộ hoàn tất: ${synced} cập nhật, ${errors} lỗi`)
    return { synced, errors }
  }

  private notifyCustomerAsync(
    orderId: string,
    status: FulfillmentStatus
  ): void {
    const isDelivered = status === FulfillmentStatus.DELIVERED

    void this.fulfillmentRepo
      .findOrderParticipants(orderId)
      .then(participants => {
        if (!participants) return
        const type = isDelivered
          ? NotificationType.ORDER_DELIVERED
          : NotificationType.ORDER_SHIPPED
        const [title, message] = isDelivered
          ? [
              'Đơn hàng đã giao thành công',
              `Đơn hàng ${orderId} đã được giao. Cảm ơn bạn đã mua sắm!`
            ]
          : [
              'Đơn hàng đang trên đường giao',
              `Đơn hàng ${orderId} đã được bàn giao cho GHN.`
            ]
        return this.notificationService.createNotification(
          participants.customerId,
          { type, title, message }
        )
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(
          `Không thể notify customer cho order ${orderId}: ${msg}`
        )
      })
  }
}
