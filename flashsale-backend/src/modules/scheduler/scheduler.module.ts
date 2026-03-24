import { Module } from '@nestjs/common'
import { SchedulerService } from './services/scheduler.service'
import { SchedulerRepository } from './repositories/scheduler.repository'
import { ReservationModule } from '@modules/reservation/reservation.module'
import { NotificationModule } from '@modules/notification/notification.module'
import { PaymentModule } from '@modules/payment/payment.module'

@Module({
  imports: [
    ReservationModule,
    NotificationModule,
    // PaymentModule cung cấp PaymentRecoveryService cho recovery cron job
    PaymentModule
  ],
  providers: [SchedulerService, SchedulerRepository]
})
export class SchedulerModule {}
