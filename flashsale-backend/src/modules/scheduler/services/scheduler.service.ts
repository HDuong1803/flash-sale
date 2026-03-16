import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { RedisService } from '@infrastructure/redis/redis.service'
import { ReservationService } from '@modules/reservation/services/reservation.service'
import { NotificationService } from '@modules/notification/services/notification.service'
import { SchedulerRepository } from '../repositories/scheduler.repository'

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name)

  constructor(
    private readonly schedulerRepository: SchedulerRepository,
    private readonly redis: RedisService,
    private readonly reservationService: ReservationService,
    private readonly notificationService: NotificationService
  ) {}

  /** Every minute — activate APPROVED campaigns when startTime is reached */
  @Cron(CronExpression.EVERY_MINUTE)
  async activateCampaigns(): Promise<void> {
    const campaigns = await this.schedulerRepository.findCampaignsToActivate()

    for (const campaign of campaigns) {
      try {
        // Load stock into Redis for each product
        for (const cp of campaign.campaignProducts) {
          await this.redis.initStock(cp.id, cp.saleQuantity)
        }

        // Load pre-registered users into whitelist SET
        if (campaign.preRegistrations.length > 0) {
          await this.redis.loadWhitelist(
            campaign.id,
            campaign.preRegistrations.map(r => r.customerId)
          )
        }

        await this.schedulerRepository.updateCampaignStatus(
          campaign.id,
          'ACTIVE'
        )
        this.logger.log(`Campaign activated: ${campaign.id} (${campaign.name})`)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        this.logger.error(
          `Failed to activate campaign ${campaign.id}: ${message}`
        )
      }
    }
  }

  /** Every minute — close ACTIVE campaigns when endTime is reached, sync stock to DB */
  @Cron(CronExpression.EVERY_MINUTE)
  async closeCampaigns(): Promise<void> {
    const campaigns = await this.schedulerRepository.findCampaignsToClose()

    for (const campaign of campaigns) {
      try {
        // Sync remaining Redis stock to DB before closing
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
          'ENDED'
        )
        this.logger.log(`Campaign closed: ${campaign.id} (${campaign.name})`)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        this.logger.error(`Failed to close campaign ${campaign.id}: ${message}`)
      }
    }
  }

  /** Every 30 seconds — release expired reservations via Redis sorted set */
  @Cron('*/30 * * * * *')
  async releaseExpiredReservations(): Promise<void> {
    const expiredIds = await this.redis.getExpiredReservations(Date.now())
    if (!expiredIds.length) return

    let released = 0
    for (const id of expiredIds) {
      try {
        await this.reservationService.releaseReservation(id, 'TTL_EXPIRED')
        released++
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        this.logger.warn(`Failed to release reservation ${id}: ${message}`)
      }
    }

    if (released > 0) {
      this.logger.log(`Released ${released} expired reservations`)
    }
  }

  /** Every minute — send T-15min reminders to pre-registered users */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendPreRegReminders(): Promise<void> {
    const campaigns = await this.schedulerRepository.findCampaignsForReminders()

    for (const campaign of campaigns) {
      for (const reg of campaign.preRegistrations) {
        try {
          await this.notificationService.createNotification(reg.customerId, {
            type: 'CAMPAIGN_STARTING',
            title: 'Flash Sale sắp bắt đầu!',
            message: `${campaign.name} bắt đầu sau 15 phút. Hãy sẵn sàng!`
          })
          await this.schedulerRepository.markReminderSent(reg.id)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          this.logger.warn(
            `Failed to send reminder for preReg ${reg.id}: ${message}`
          )
        }
      }
    }
  }

  /** Every 5 minutes — sync Redis stock to DB for active campaigns (backup sync) */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncStockToDatabase(): Promise<void> {
    const products = await this.schedulerRepository.findActiveCampaignProducts()

    for (const cp of products) {
      const remaining = await this.redis.getStock(cp.id)
      if (remaining !== null) {
        await this.schedulerRepository.updateCampaignProductRemaining(
          cp.id,
          remaining
        )
      }
    }
  }
}
