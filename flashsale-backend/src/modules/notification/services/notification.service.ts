// notification.service.ts — stubbed for Flash Sale schema (Session 7 will implement)

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@local-prisma/prisma.service'
import {
  GetNotificationsQueryDto,
  GetNotificationsResponseDto,
  UpdateNotificationStatusDto,
  UpdateNotificationStatusResponseDto
} from '../dto/notification.dto'

/**
 * Notification Service
 * TODO: Implement for Flash Sale domain in Session 7
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(private readonly prismaService: PrismaService) {}

  async getNotifications(
    _userId: string,
    _query: GetNotificationsQueryDto
  ): Promise<GetNotificationsResponseDto> {
    return Promise.resolve({ notifications: [], total: 0 })
  }

  async updateNotificationStatus(
    _userId: string,
    _updateDto: UpdateNotificationStatusDto
  ): Promise<UpdateNotificationStatusResponseDto> {
    return Promise.resolve({ updatedCount: 0, updatedNotificationIds: [] })
  }
}
