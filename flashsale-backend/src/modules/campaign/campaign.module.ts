import { Module } from '@nestjs/common'
import { CampaignController } from './controllers/campaign.controller'
import { CampaignService } from './services/campaign.service'
import { CampaignRepository } from './repositories/campaign.repository'
import { RescheduleRequestRepository } from './repositories/reschedule-request.repository'
import { MerchantModule } from '@modules/merchant/merchant.module'
import { ProductModule } from '@modules/product/product.module'
import { NotificationModule } from '@modules/notification/notification.module'

@Module({
  imports: [MerchantModule, ProductModule, NotificationModule],
  controllers: [CampaignController],
  providers: [CampaignService, CampaignRepository, RescheduleRequestRepository],
  exports: [CampaignRepository, RescheduleRequestRepository],
})
export class CampaignModule {}
