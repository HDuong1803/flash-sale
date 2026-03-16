import { Module } from '@nestjs/common'
import { SchedulerService } from './services/scheduler.service'
import { SchedulerRepository } from './repositories/scheduler.repository'
import { ReservationModule } from '@modules/reservation/reservation.module'
import { NotificationModule } from '@modules/notification/notification.module'

@Module({
  imports: [ReservationModule, NotificationModule],
  providers: [SchedulerService, SchedulerRepository]
})
export class SchedulerModule {}
