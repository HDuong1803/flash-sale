import { Module } from '@nestjs/common'
import { OrderWorker } from './order.worker'
import { ReservationModule } from '@modules/reservation/reservation.module'

@Module({
  imports: [ReservationModule],
  providers: [OrderWorker]
})
export class WorkersModule {}
