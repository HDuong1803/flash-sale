import { Module } from '@nestjs/common'
import { AdminController } from './controllers/admin.controller'
import { AdminStreamController } from './controllers/admin-stream.controller'
import { AdminService } from './services/admin.service'
import { AdminRepository } from './repositories/admin.repository'
import { CampaignModule } from '@modules/campaign/campaign.module'
import { NotificationModule } from '@modules/notification/notification.module'
import { PaymentModule } from '@modules/payment/payment.module'

@Module({
  imports: [CampaignModule, NotificationModule, PaymentModule],
  controllers: [AdminController, AdminStreamController],
  providers: [AdminService, AdminRepository]
})
export class AdminModule {}
