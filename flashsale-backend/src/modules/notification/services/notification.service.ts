import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationRepository } from '../repositories/notification.repository'

@Injectable()
export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository
  ) {}

  async createNotification(
    userId: string,
    data: {
      type: NotificationType
      title: string
      message: string
    }
  ): Promise<void> {
    await this.notificationRepository.create({ userId, ...data })
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
