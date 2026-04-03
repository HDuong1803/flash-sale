import { Module } from '@nestjs/common'
import { NotificationController } from './controllers/notification.controller'
import { TelegramWebhookController } from './controllers/telegram-webhook.controller'
import { NotificationService } from './services/notification.service'
import { TelegramNotificationService } from './services/telegram-notification.service'
import { NotificationRepository } from './repositories/notification.repository'

@Module({
  controllers: [NotificationController, TelegramWebhookController],
  providers: [
    NotificationService,
    TelegramNotificationService,
    NotificationRepository
  ],
  exports: [NotificationService, TelegramNotificationService]
})
export class NotificationModule {}
