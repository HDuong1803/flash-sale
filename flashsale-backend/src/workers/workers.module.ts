import { Module } from '@nestjs/common'
import { OrderWorker } from './order.worker'
import { ReservationModule } from '@modules/reservation/reservation.module'
import { NotificationModule } from '@modules/notification/notification.module'
import { OrderModule } from '@modules/order/order.module'
import { FulfillmentModule } from '@modules/fulfillment/fulfillment.module'
import { NotificationWorker } from './notification.worker'
import { EmailWorker } from './email.worker'
import { TelegramWorker } from './telegram.worker'
import { FulfillmentWorker } from './fulfillment.worker'

@Module({
  imports: [
    ReservationModule,
    NotificationModule,
    OrderModule,
    FulfillmentModule
  ],
  providers: [
    OrderWorker,
    NotificationWorker,
    EmailWorker,
    TelegramWorker,
    FulfillmentWorker
  ]
})
export class WorkersModule {}
