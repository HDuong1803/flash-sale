import { Module } from '@nestjs/common'
import { PaymentController } from './controllers/payment.controller'
import { PaymentService } from './services/payment.service'
import { SagaCoordinatorService } from './services/saga-coordinator.service'
import { StripeService } from './services/stripe.service'
import { PaymentGatewayRegistry } from './services/payment-gateway.registry'
import { PaymentGatewayConfigService } from './services/payment-gateway-config.service'
import { PaymentRecoveryService } from './services/payment-recovery.service'
import { PaymentRepository } from './repositories/payment.repository'
import { ReservationModule } from '@modules/reservation/reservation.module'
import { NotificationModule } from '@modules/notification/notification.module'

@Module({
  imports: [ReservationModule, NotificationModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    SagaCoordinatorService,
    StripeService,
    PaymentGatewayRegistry,
    PaymentGatewayConfigService,
    PaymentRepository,
    PaymentRecoveryService
  ],
  // Export để SchedulerModule inject PaymentRecoveryService vào recovery cron job
  exports: [
    StripeService,
    PaymentGatewayRegistry,
    PaymentGatewayConfigService,
    PaymentRecoveryService
  ]
})
export class PaymentModule {}
