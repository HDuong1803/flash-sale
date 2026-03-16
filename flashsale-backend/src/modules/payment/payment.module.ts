import { Module } from '@nestjs/common'
import { PaymentController } from './controllers/payment.controller'
import { PaymentService } from './services/payment.service'
import { SagaCoordinatorService } from './services/saga-coordinator.service'
import { PaymentRepository } from './repositories/payment.repository'
import { ReservationModule } from '@modules/reservation/reservation.module'
import { NotificationModule } from '@modules/notification/notification.module'

@Module({
  imports: [ReservationModule, NotificationModule],
  controllers: [PaymentController],
  providers: [PaymentService, SagaCoordinatorService, PaymentRepository]
})
export class PaymentModule {}
