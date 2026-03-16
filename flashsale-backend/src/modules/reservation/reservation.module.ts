import { Module } from '@nestjs/common'
import { ReservationService } from './services/reservation.service'
import { ReservationRepository } from './repositories/reservation.repository'

@Module({
  providers: [ReservationService, ReservationRepository],
  exports: [ReservationService, ReservationRepository]
})
export class ReservationModule {}
