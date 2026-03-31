import { Module } from '@nestjs/common'
import { AdminController } from './controllers/admin.controller'
import { AdminService } from './services/admin.service'
import { AdminRepository } from './repositories/admin.repository'
import { CampaignModule } from '@modules/campaign/campaign.module'
import { NotificationModule } from '@modules/notification/notification.module'

@Module({
  imports: [CampaignModule, NotificationModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository]
})
export class AdminModule {}
