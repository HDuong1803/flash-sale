import { Module } from '@nestjs/common'
import { NotificationController } from './controllers/notification.controller'
import { NotificationService } from './services/notification.service'
import { NotificationRepository } from './repositories/notification.repository'

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository],
  exports: [NotificationService]
})
export class NotificationModule {}
