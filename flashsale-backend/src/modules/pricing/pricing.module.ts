import { Module } from '@nestjs/common'
import { PricingController } from './controllers/pricing.controller'
import { PricingEngineService } from './services/pricing-engine.service'
import { PricingSchedulerService } from './services/pricing-scheduler.service'
import { PricingRepository } from './repositories/pricing.repository'

@Module({
  controllers: [PricingController],
  providers: [PricingEngineService, PricingSchedulerService, PricingRepository],
  exports: [PricingEngineService]
})
export class PricingModule {}
