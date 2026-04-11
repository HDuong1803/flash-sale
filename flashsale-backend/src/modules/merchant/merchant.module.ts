import { Module } from '@nestjs/common'
import { NotificationModule } from '@modules/notification/notification.module'
import { PaymentModule } from '@modules/payment/payment.module'
import { MerchantController } from './controllers/merchant.controller'
import { MerchantService } from './services/merchant.service'
import { MerchantConnectService } from './services/merchant-connect.service'
import { MerchantRepository } from './repositories/merchant.repository'

@Module({
  imports: [NotificationModule, PaymentModule],
  controllers: [MerchantController],
  providers: [MerchantService, MerchantConnectService, MerchantRepository],
  exports: [MerchantRepository]
})
export class MerchantModule {}
