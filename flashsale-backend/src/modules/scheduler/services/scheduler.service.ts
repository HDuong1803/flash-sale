import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CampaignStatus, NotificationType } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { ReservationService } from '@modules/reservation/services/reservation.service'
import { NotificationService } from '@modules/notification/services/notification.service'
import { PaymentRecoveryService } from '@modules/payment/services/payment-recovery.service'
import { SchedulerRepository } from '../repositories/scheduler.repository'

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name)

  constructor(
    private readonly schedulerRepository: SchedulerRepository,
    private readonly redis: RedisService,
    private readonly reservationService: ReservationService,
    private readonly notificationService: NotificationService,
    private readonly paymentRecovery: PaymentRecoveryService
  ) {}

  /** Every minute — activate APPROVED campaigns when startTime is reached */
  @Cron(CronExpression.EVERY_MINUTE)
  async activateCampaigns(): Promise<void> {
    // Fix Critical-1: dùng token-based lock thay vì simple DEL (tránh xóa nhầm lock của instance khác)
    const token = await this.redis.acquireLockToken(
      'scheduler:activateCampaigns',
      55_000
    )
    if (!token) return

    try {
      const campaigns = await this.schedulerRepository.findCampaignsToActivate()

      for (const campaign of campaigns) {
        try {
          for (const cp of campaign.campaignProducts) {
            await this.redis.initStock(cp.id, cp.saleQuantity)
          }

          if (campaign.preRegistrations.length > 0) {
            await this.redis.loadWhitelist(
              campaign.id,
              campaign.preRegistrations.map(r => r.customerId)
            )
          }

          await this.schedulerRepository.updateCampaignStatus(
            campaign.id,
            CampaignStatus.ACTIVE
          )
          this.logger.log(
            `Campaign activated: ${campaign.id} (${campaign.name})`
          )
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Lỗi không xác định'
          this.logger.error(
            `Failed to activate campaign ${campaign.id}: ${message}`
          )
        }
      }
    } finally {
      await this.redis.releaseLockToken('scheduler:activateCampaigns', token)
    }
  }

  /** Every minute — close ACTIVE campaigns when endTime is reached, sync stock to DB */
  @Cron(CronExpression.EVERY_MINUTE)
  async closeCampaigns(): Promise<void> {
    const token = await this.redis.acquireLockToken(
      'scheduler:closeCampaigns',
      55_000
    )
    if (!token) return

    try {
      const campaigns = await this.schedulerRepository.findCampaignsToClose()

      for (const campaign of campaigns) {
        try {
          for (const cp of campaign.campaignProducts) {
            const remaining = await this.redis.getStock(cp.id)
            if (remaining !== null) {
              await this.schedulerRepository.updateCampaignProductRemaining(
                cp.id,
                remaining
              )
            }
          }
          await this.schedulerRepository.updateCampaignStatus(
            campaign.id,
            CampaignStatus.ENDED
          )
          this.logger.log(`Campaign closed: ${campaign.id} (${campaign.name})`)
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Lỗi không xác định'
          this.logger.error(
            `Failed to close campaign ${campaign.id}: ${message}`
          )
        }
      }
    } finally {
      await this.redis.releaseLockToken('scheduler:closeCampaigns', token)
    }
  }

  /** Every 30 seconds — release expired reservations via Redis sorted set */
  @Cron('*/30 * * * * *')
  async releaseExpiredReservations(): Promise<void> {
    const token = await this.redis.acquireLockToken(
      'scheduler:releaseExpired',
      25_000
    )
    if (!token) return

    try {
      // Batch size 500 — prevents processing 50k+ expiries in one tick
      const expiredIds = await this.redis.getExpiredReservations(
        Date.now(),
        500
      )
      if (!expiredIds.length) return

      let released = 0
      for (const id of expiredIds) {
        try {
          await this.reservationService.releaseReservation(id, 'TTL_EXPIRED')
          released++
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Lỗi không xác định'
          this.logger.warn(`Failed to release reservation ${id}: ${message}`)
        }
      }

      if (released > 0) {
        this.logger.log(`Released ${released} expired reservations`)
      }
    } finally {
      await this.redis.releaseLockToken('scheduler:releaseExpired', token)
    }
  }

  /** Every minute — send T-15min reminders to pre-registered users */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendPreRegReminders(): Promise<void> {
    const token = await this.redis.acquireLockToken(
      'scheduler:sendReminders',
      55_000
    )
    if (!token) return

    try {
      const campaigns =
        await this.schedulerRepository.findCampaignsForReminders()

      for (const campaign of campaigns) {
        for (const reg of campaign.preRegistrations) {
          try {
            await this.notificationService.createNotification(reg.customerId, {
              type: NotificationType.CAMPAIGN_STARTING,
              title: 'Flash Sale sắp bắt đầu!',
              message: `${campaign.name} bắt đầu sau 15 phút. Hãy sẵn sàng!`
            })
            await this.schedulerRepository.markReminderSent(reg.id)
          } catch (err: unknown) {
            const message =
              err instanceof Error ? err.message : 'Lỗi không xác định'
            this.logger.warn(
              `Failed to send reminder for preReg ${reg.id}: ${message}`
            )
          }
        }
      }
    } finally {
      await this.redis.releaseLockToken('scheduler:sendReminders', token)
    }
  }

  /** Every 5 minutes — sync Redis stock to DB for active campaigns (backup sync) */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncStockToDatabase(): Promise<void> {
    const token = await this.redis.acquireLockToken(
      'scheduler:syncStock',
      290_000
    )
    if (!token) return

    try {
      const products =
        await this.schedulerRepository.findActiveCampaignProducts()

      for (const cp of products) {
        const remaining = await this.redis.getStock(cp.id)
        if (remaining !== null) {
          await this.schedulerRepository.updateCampaignProductRemaining(
            cp.id,
            remaining
          )
        }
      }
    } finally {
      await this.redis.releaseLockToken('scheduler:syncStock', token)
    }
  }

  /**
   * Every 10 minutes — recover payments stuck in PROCESSING state.
   *
   * Khi payment webhook được nhận, payment chuyển PENDING → PROCESSING (atomic).
   * Saga sau đó chạy để tạo Order. Nếu saga thất bại (timeout, checkout expired,
   * DB lỗi tạm thời), payment vẫn ở PROCESSING mà không có orderId.
   * Khách đã chuyển tiền nhưng chưa có đơn hàng — phải tự động recover.
   *
   * Recovery logic:
   * - Tìm payment PROCESSING không có orderId, stuck > 10 phút
   * - Retry saga với transactionId từ webhook log
   * - Nếu thành công: payment → SUCCESS, order được tạo, khách nhận thông báo
   * - Nếu stuck > 60 phút: log CRITICAL + Sentry alert → ops team xử lý thủ công
   */
  @Cron('0 */10 * * * *')
  async recoverStuckPayments(): Promise<void> {
    const token = await this.redis.acquireLockToken(
      'scheduler:recoverPayments',
      590_000
    )
    if (!token) return

    try {
      await this.paymentRecovery.recoverStuckPayments()
    } catch (err: unknown) {
      // Job lỗi không được throw — sẽ ảnh hưởng đến các job khác trong scheduler
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      this.logger.error({ event: 'recovery_job_failed', error: message })
    } finally {
      await this.redis.releaseLockToken('scheduler:recoverPayments', token)
    }
  }
}
