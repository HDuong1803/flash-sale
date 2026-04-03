import { Injectable } from '@nestjs/common'
import {
  CampaignStatus,
  KycStatus,
  Notification,
  NotificationPreference,
  TelegramDelivery,
  TelegramDeliveryStatus,
  TelegramLink,
  NotificationType,
  UserRole
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
      telegramEnabled?: boolean
    }
  ): Promise<NotificationPreference> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        notificationsEnabled: data.notificationsEnabled ?? true,
        campaignReminderEnabled: data.campaignReminderEnabled ?? true,
        orderStatusEnabled: data.orderStatusEnabled ?? true,
        telegramEnabled: data.telegramEnabled ?? false
      }
    })
  }

  async findActiveTelegramLinkByUserId(
    userId: string
  ): Promise<TelegramLink | null> {
    return this.prisma.telegramLink.findFirst({
      where: {
        userId,
        revokedAt: null
      }
    })
  }

  async findActiveTelegramLinkByChatId(
    telegramChatId: string
  ): Promise<TelegramLink | null> {
    return this.prisma.telegramLink.findFirst({
      where: {
        telegramChatId,
        revokedAt: null
      }
    })
  }

  async upsertTelegramLink(data: {
    userId: string
    telegramChatId: string
    telegramUserId: string
    telegramUsername?: string | null
    telegramFirstName?: string | null
    telegramLastName?: string | null
    lastInteractionAt?: Date
  }): Promise<TelegramLink> {
    return this.prisma.telegramLink.upsert({
      where: { userId: data.userId },
      update: {
        telegramChatId: data.telegramChatId,
        telegramUserId: data.telegramUserId,
        telegramUsername: data.telegramUsername ?? null,
        telegramFirstName: data.telegramFirstName ?? null,
        telegramLastName: data.telegramLastName ?? null,
        revokedAt: null,
        linkedAt: new Date(),
        lastInteractionAt: data.lastInteractionAt ?? new Date()
      },
      create: {
        userId: data.userId,
        telegramChatId: data.telegramChatId,
        telegramUserId: data.telegramUserId,
        telegramUsername: data.telegramUsername ?? null,
        telegramFirstName: data.telegramFirstName ?? null,
        telegramLastName: data.telegramLastName ?? null,
        linkedAt: new Date(),
        lastInteractionAt: data.lastInteractionAt ?? new Date()
      }
    })
  }

  async revokeTelegramLink(userId: string): Promise<{ revoked: boolean }> {
    const updated = await this.prisma.telegramLink.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    })

    return { revoked: updated.count > 0 }
  }

  async createTelegramDelivery(data: {
    userId: string
    notificationId?: string
    eventType: NotificationType
    idempotencyKey: string
  }): Promise<TelegramDelivery> {
    return this.prisma.telegramDelivery.create({
      data: {
        userId: data.userId,
        notificationId: data.notificationId,
        eventType: data.eventType,
        idempotencyKey: data.idempotencyKey,
        status: TelegramDeliveryStatus.PENDING,
        attemptCount: 0
      }
    })
  }

  async markTelegramDeliverySent(
    id: string,
    providerMessageId: string,
    attemptCount: number
  ): Promise<void> {
    await this.prisma.telegramDelivery.update({
      where: { id },
      data: {
        status: TelegramDeliveryStatus.SENT,
        providerMessageId,
        attemptCount,
        sentAt: new Date(),
        errorCode: null,
        errorMessage: null
      }
    })
  }

  async markTelegramDeliveryFailed(
    id: string,
    data: {
      errorCode?: string
      errorMessage?: string
      attemptCount: number
    }
  ): Promise<void> {
    await this.prisma.telegramDelivery.update({
      where: { id },
      data: {
        status: TelegramDeliveryStatus.FAILED,
        attemptCount: data.attemptCount,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
        sentAt: null
      }
    })
  }

  async findUserIdsByRole(role: UserRole): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { role },
      select: { id: true }
    })

    return users.map(user => user.id)
  }

  async findUserRoleById(userId: string): Promise<UserRole | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    })

    return user?.role ?? null
  }

  async findMerchantForAdminAction(merchantId: string): Promise<{
    id: string
    userId: string
    businessName: string
    kycStatus: KycStatus
  } | null> {
    return this.prisma.merchantProfile.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        userId: true,
        businessName: true,
        kycStatus: true
      }
    })
  }

  async approveMerchantFromAdminAction(
    merchantId: string,
    merchantUserId: string
  ): Promise<boolean> {
    return this.prisma.$transaction(async tx => {
      const updated = await tx.merchantProfile.updateMany({
        where: {
          id: merchantId,
          kycStatus: KycStatus.PENDING
        },
        data: { kycStatus: KycStatus.APPROVED }
      })

      if (updated.count === 0) {
        return false
      }

      await tx.user.update({
        where: { id: merchantUserId },
        data: { role: UserRole.MERCHANT }
      })

      return true
    })
  }

  async rejectMerchantFromAdminAction(
    merchantId: string,
    reason: string
  ): Promise<boolean> {
    const updated = await this.prisma.merchantProfile.updateMany({
      where: {
        id: merchantId,
        kycStatus: KycStatus.PENDING
      },
      data: {
        kycStatus: KycStatus.REJECTED,
        rejectionReason: reason
      }
    })

    return updated.count > 0
  }

  async findCampaignForAdminAction(campaignId: string): Promise<{
    id: string
    name: string
    status: CampaignStatus
    deletedAt: Date | null
  } | null> {
    return this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        status: true,
        deletedAt: true
      }
    })
  }

  async updateCampaignStatusFromAdminAction(
    campaignId: string,
    expectedStatus: CampaignStatus,
    nextStatus: CampaignStatus
  ): Promise<boolean> {
    const updated = await this.prisma.campaign.updateMany({
      where: {
        id: campaignId,
        status: expectedStatus,
        deletedAt: null
      },
      data: { status: nextStatus }
    })

    return updated.count > 0
  }
}
