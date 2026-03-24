import { Module } from '@nestjs/common'
import { PaymentController } from './controllers/payment.controller'
import { PaymentService } from './services/payment.service'
import { SagaCoordinatorService } from './services/saga-coordinator.service'
import { SepayService } from './services/sepay.service'
import { PaymentRecoveryService } from './services/payment-recovery.service'
import { SepayWebhookGuard } from './guards/sepay-webhook.guard'
import { PaymentRepository } from './repositories/payment.repository'
import { ReservationModule } from '@modules/reservation/reservation.module'
import { NotificationModule } from '@modules/notification/notification.module'

@Module({
  imports: [ReservationModule, NotificationModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    SagaCoordinatorService,
    SepayService,
    SepayWebhookGuard,
    PaymentRepository,
    PaymentRecoveryService
  ],
  // Export để SchedulerModule inject PaymentRecoveryService vào recovery cron job
  exports: [SepayService, PaymentRecoveryService]
})
export class PaymentModule {}
