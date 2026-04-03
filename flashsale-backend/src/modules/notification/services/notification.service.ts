import { Injectable, Logger } from '@nestjs/common'
import { NotificationType, UserRole } from '@prisma/client'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import {
  FAILED_QUEUE_NAMES,
  QUEUE_NAMES
} from '@infrastructure/rabbitmq/rabbitmq.constants'
import { NotificationRepository } from '../repositories/notification.repository'
import {
  TelegramActionDescriptor,
  TelegramNotificationService
} from './telegram-notification.service'

export interface NotificationJobPayload {
  userId: string
  type: NotificationType
  title: string
  message: string
  telegramActions?: TelegramActionDescriptor[]
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly rabbitmq: RabbitMQService,
    private readonly telegramNotificationService: TelegramNotificationService
  ) {}

  async createNotification(
    userId: string,
    data: {
      type: NotificationType
      title: string
      message: string
      telegramActions?: TelegramActionDescriptor[]
    }
  ): Promise<void> {
    const preferences =
      await this.notificationRepository.getOrCreatePreferences(userId)

    if (!preferences.notificationsEnabled) {
      return
    }

    const isCampaignReminderType = data.type === 'CAMPAIGN_STARTING'
    const isOrderStatusType =
      data.type === 'ORDER_CONFIRMED' || data.type === 'PAYMENT_FAILED'

    if (isCampaignReminderType && !preferences.campaignReminderEnabled) {
      return
    }

    if (isOrderStatusType && !preferences.orderStatusEnabled) {
      return
    }

    const published = await this.rabbitmq.publish(QUEUE_NAMES.NOTIFICATION, {
      userId,
      ...data
    })

    if (!published) {
      this.logger.error(
        `Cannot enqueue notification for user=${userId}; message kept out of main flow`
      )
    }
  }

  async processNotificationJob(payload: NotificationJobPayload): Promise<void> {
    const created = await this.notificationRepository.create(payload)

    const preferences =
      await this.notificationRepository.getOrCreatePreferences(payload.userId)

    if (!preferences.notificationsEnabled || !preferences.telegramEnabled) {
      return
    }

    await this.telegramNotificationService.enqueueTelegramNotification({
      notificationId: created.id,
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      telegramActions: payload.telegramActions
    })
  }

  async startNotificationConsumer(): Promise<void> {
    await this.rabbitmq.consume(
      QUEUE_NAMES.NOTIFICATION,
      msg => this.processNotificationMessage(msg.content.toString()),
      {
        prefetch: 10,
        maxRetries: 5,
        retryDelayMs: 2_000,
        failedQueue: FAILED_QUEUE_NAMES.NOTIFICATIONS
      }
    )
  }

  private async processNotificationMessage(raw: string): Promise<void> {
    const payload = JSON.parse(raw) as NotificationJobPayload
    await this.processNotificationJob(payload)
  }

  async getNotifications(userId: string) {
    return this.notificationRepository.findByUserId(userId)
  }

  async markRead(userId: string, notificationId: string) {
    return this.notificationRepository.markRead(userId, notificationId)
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepository.markAllRead(userId)
  }

  async getPreferences(userId: string): Promise<{
    notificationsEnabled: boolean
    campaignReminderEnabled: boolean
    orderStatusEnabled: boolean
    telegramEnabled: boolean
  }> {
    const preferences =
      await this.notificationRepository.getOrCreatePreferences(userId)

    return {
      notificationsEnabled: preferences.notificationsEnabled,
      campaignReminderEnabled: preferences.campaignReminderEnabled,
      orderStatusEnabled: preferences.orderStatusEnabled,
      telegramEnabled: preferences.telegramEnabled
    }
  }

  async updatePreferences(
    userId: string,
    payload: {
      notificationsEnabled?: boolean
      campaignReminderEnabled?: boolean
      orderStatusEnabled?: boolean
      telegramEnabled?: boolean
    }
  ): Promise<{
    notificationsEnabled: boolean
    campaignReminderEnabled: boolean
    orderStatusEnabled: boolean
    telegramEnabled: boolean
  }> {
    const existing = await this.notificationRepository.getOrCreatePreferences(
      userId
    )

    const nextNotificationsEnabled =
      payload.notificationsEnabled ?? existing.notificationsEnabled

    const nextCampaignReminderEnabled = nextNotificationsEnabled
      ? payload.campaignReminderEnabled ?? existing.campaignReminderEnabled
      : false

    const nextOrderStatusEnabled = nextNotificationsEnabled
      ? payload.orderStatusEnabled ?? existing.orderStatusEnabled
      : false

    const nextTelegramEnabled = nextNotificationsEnabled
      ? payload.telegramEnabled ?? existing.telegramEnabled
      : false

    const updated = await this.notificationRepository.updatePreferences(
      userId,
      {
        notificationsEnabled: nextNotificationsEnabled,
        campaignReminderEnabled: nextCampaignReminderEnabled,
        orderStatusEnabled: nextOrderStatusEnabled,
        telegramEnabled: nextTelegramEnabled
      }
    )

    return {
      notificationsEnabled: updated.notificationsEnabled,
      campaignReminderEnabled: updated.campaignReminderEnabled,
      orderStatusEnabled: updated.orderStatusEnabled,
      telegramEnabled: updated.telegramEnabled
    }
  }

  async notifyUsersByRole(
    role: UserRole,
    data: {
      type: NotificationType
      title: string
      message: string
      telegramActions?: TelegramActionDescriptor[]
    }
  ): Promise<void> {
    const userIds = await this.notificationRepository.findUserIdsByRole(role)
    if (!userIds.length) return

    await Promise.allSettled(
      userIds.map(async userId => {
        await this.createNotification(userId, data)
      })
    )
  }

  async notifyAdmins(data: {
    type: NotificationType
    title: string
    message: string
    telegramActions?: TelegramActionDescriptor[]
  }): Promise<void> {
    await this.notifyUsersByRole('ADMIN', data)
  }
}
