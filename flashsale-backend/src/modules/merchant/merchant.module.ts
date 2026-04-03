import { Module } from '@nestjs/common'
import { NotificationModule } from '@modules/notification/notification.module'
import { MerchantController } from './controllers/merchant.controller'
import { MerchantService } from './services/merchant.service'
import { MerchantRepository } from './repositories/merchant.repository'

@Module({
  imports: [NotificationModule],
  controllers: [MerchantController],
  providers: [MerchantService, MerchantRepository],
  exports: [MerchantRepository]
})
export class MerchantModule {}
