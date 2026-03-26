import { Injectable, Logger } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import {
  FAILED_QUEUE_NAMES,
  QUEUE_NAMES
} from '@infrastructure/rabbitmq/rabbitmq.constants'
import { NotificationRepository } from '../repositories/notification.repository'

export interface NotificationJobPayload {
  userId: string
  type: NotificationType
  title: string
  message: string
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly rabbitmq: RabbitMQService
  ) {}

  async createNotification(
    userId: string,
    data: {
      type: NotificationType
      title: string
      message: string
    }
  ): Promise<void> {
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
    await this.notificationRepository.create(payload)
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
}
