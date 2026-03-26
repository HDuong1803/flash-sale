import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { NotificationService } from '@modules/notification/services/notification.service'

@Injectable()
export class NotificationWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationWorker.name)

  constructor(private readonly notificationService: NotificationService) {}

  async onModuleInit(): Promise<void> {
    await this.notificationService.startNotificationConsumer()
    this.logger.log('Notification Worker started — consuming notification queue')
  }
}
