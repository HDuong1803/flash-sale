// notification-helper.service.ts — stubbed for Flash Sale schema (Session 7 will rewrite)

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@local-prisma/prisma.service'
import { EmailService } from '@common/providers/email.service'
import { ConfigService } from '@nestjs/config'

interface NotificationPayload {
  type: string
  title: string
  content: Record<string, unknown>
  userId: string
  isGlobal?: boolean
  metadata?: Record<string, unknown>
}

interface NotificationRecipient {
  userId: string
  isRead?: boolean
}

interface NotificationContext {
  contractTemplateId?: string
  prePairDocsId?: string
  commentType?: string
}

/**
 * Notification Helper Service
 * TODO: Rewrite for Flash Sale domain in Session 7
 */
@Injectable()
export class NotificationHelperService {
  private readonly logger = new Logger(NotificationHelperService.name)

  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService
  ) {}

  async sendNotification(
    _payload: NotificationPayload,
    _recipients: NotificationRecipient[],
    _channels: string[] = ['DATABASE', 'SOCKET', 'EMAIL'],
    _context: NotificationContext = {}
  ): Promise<string[]> {
    return Promise.resolve([])
  }

  async getNotifyUserIds(_context: NotificationContext): Promise<string[]> {
    return Promise.resolve([])
  }
}
