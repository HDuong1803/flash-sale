import { Module } from '@nestjs/common'
import { MerchantController } from './controllers/merchant.controller'
import { MerchantService } from './services/merchant.service'
import { MerchantRepository } from './repositories/merchant.repository'

@Module({
  controllers: [MerchantController],
  providers: [MerchantService, MerchantRepository],
  exports: [MerchantRepository]
})
export class MerchantModule {}
