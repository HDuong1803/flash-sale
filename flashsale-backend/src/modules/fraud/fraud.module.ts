import { Module } from '@nestjs/common'
import { FraudController } from './controllers/fraud.controller'
import { FraudService } from './services/fraud.service'
import { FraudGuard } from './fraud.guard'
import { FraudRepository } from './repositories/fraud.repository'

@Module({
  controllers: [FraudController],
  providers: [FraudService, FraudGuard, FraudRepository],
  exports: [FraudService, FraudGuard]
})
export class FraudModule {}
