import { Module } from '@nestjs/common'
import { GHNModule } from '@infrastructure/ghn/ghn.module'
import { RedisModule } from '@infrastructure/redis'
import { NotificationModule } from '@modules/notification/notification.module'
import { FulfillmentController } from './controllers/fulfillment.controller'
import { QcController } from './controllers/qc.controller'
import { FulfillmentService } from './services/fulfillment.service'
import { FulfillmentRulesEngine } from './services/fulfillment-rules.engine'
import { FulfillmentSlaService } from './services/fulfillment-sla.service'
import { FulfillmentPollingService } from './services/fulfillment-polling.service'
import { QcService } from './services/qc.service'
import { FulfillmentRepository } from './repositories/fulfillment.repository'
import { QcRepository } from './repositories/qc.repository'

@Module({
  imports: [GHNModule, RedisModule, NotificationModule],
  controllers: [FulfillmentController, QcController],
  providers: [
    FulfillmentService,
    FulfillmentRulesEngine,
    FulfillmentSlaService,
    FulfillmentPollingService,
    QcService,
    FulfillmentRepository,
    QcRepository
  ],
  exports: [FulfillmentService, FulfillmentPollingService]
})
export class FulfillmentModule {}
