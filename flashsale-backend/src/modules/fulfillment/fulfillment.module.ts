import { Module } from '@nestjs/common'
import { EasyPostModule } from '@infrastructure/easypost/easypost.module'
import { RedisModule } from '@infrastructure/redis'
import { NotificationModule } from '@modules/notification/notification.module'
import { FulfillmentController } from './controllers/fulfillment.controller'
import { QcController } from './controllers/qc.controller'
import { FulfillmentService } from './services/fulfillment.service'
import { FulfillmentRulesEngine } from './services/fulfillment-rules.engine'
import { FulfillmentSlaService } from './services/fulfillment-sla.service'
import { QcService } from './services/qc.service'
import { FulfillmentRepository } from './repositories/fulfillment.repository'
import { QcRepository } from './repositories/qc.repository'

@Module({
  imports: [EasyPostModule, RedisModule, NotificationModule],
  controllers: [FulfillmentController, QcController],
  providers: [
    FulfillmentService,
    FulfillmentRulesEngine,
    FulfillmentSlaService,
    QcService,
    FulfillmentRepository,
    QcRepository
  ],
  exports: [FulfillmentService]
})
export class FulfillmentModule {}
