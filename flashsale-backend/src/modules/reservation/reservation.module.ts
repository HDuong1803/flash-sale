import { Module } from '@nestjs/common'
import { ReservationController } from './controllers/reservation.controller'
import { ReservationService } from './services/reservation.service'
import { ReservationRepository } from './repositories/reservation.repository'

@Module({
  controllers: [ReservationController],
  providers: [ReservationService, ReservationRepository],
  exports: [ReservationService, ReservationRepository]
})
export class ReservationModule {}
