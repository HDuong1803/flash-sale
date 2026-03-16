import { Module } from '@nestjs/common'
import { CampaignController } from './controllers/campaign.controller'
import { CampaignService } from './services/campaign.service'
import { CampaignRepository } from './repositories/campaign.repository'
import { MerchantModule } from '@modules/merchant/merchant.module'
import { ProductModule } from '@modules/product/product.module'

@Module({
  imports: [MerchantModule, ProductModule],
  controllers: [CampaignController],
  providers: [CampaignService, CampaignRepository],
  exports: [CampaignRepository]
})
export class CampaignModule {}
