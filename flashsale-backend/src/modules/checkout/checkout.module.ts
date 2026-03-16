import { Module } from '@nestjs/common'
import { CheckoutController } from './controllers/checkout.controller'
import { CheckoutService } from './services/checkout.service'
import { CheckoutRepository } from './repositories/checkout.repository'

@Module({
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutRepository]
})
export class CheckoutModule {}
