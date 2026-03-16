import { Module } from '@nestjs/common'
import { NotificationController } from './controllers'
import { NotificationService, NotificationHelperService } from './services'

@Module({
  providers: [NotificationService, NotificationHelperService],
  controllers: [NotificationController],
  exports: [NotificationService, NotificationHelperService]
})
export class NotificationModule {}
