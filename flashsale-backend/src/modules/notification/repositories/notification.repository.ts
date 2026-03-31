import { Injectable } from '@nestjs/common'
import {
  Notification,
  NotificationPreference,
  NotificationType
} from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: string
    type: NotificationType
    title: string
    message: string
  }): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        read: false
      }
    })
  }

  async findByUserId(userId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
  }

  async markRead(
    userId: string,
    notificationId: string
  ): Promise<Notification> {
    return this.prisma.notification.update({
      where: { id: notificationId, userId },
      data: { read: true }
    })
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true }
    })
  }

  async getOrCreatePreferences(
    userId: string
  ): Promise<NotificationPreference> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        notificationsEnabled: true,
        campaignReminderEnabled: true,
        orderStatusEnabled: true
      }
    })
  }

  async updatePreferences(
    userId: string,
    data: {
      notificationsEnabled?: boolean
      campaignReminderEnabled?: boolean
      orderStatusEnabled?: boolean
    }
  ): Promise<NotificationPreference> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        notificationsEnabled: data.notificationsEnabled ?? true,
        campaignReminderEnabled: data.campaignReminderEnabled ?? true,
        orderStatusEnabled: data.orderStatusEnabled ?? true
      }
    })
  }
}
