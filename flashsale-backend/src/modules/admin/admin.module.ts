import { Module } from '@nestjs/common'
import { AdminController } from './controllers/admin.controller'
import { AdminStreamController } from './controllers/admin-stream.controller'
import { BenchmarkController } from './controllers/benchmark.controller'
import { AdminService } from './services/admin.service'
import { BenchmarkService } from './services/benchmark.service'
import { AdminRepository } from './repositories/admin.repository'
import { BenchmarkRepository } from './repositories/benchmark.repository'
import { CampaignModule } from '@modules/campaign/campaign.module'
import { NotificationModule } from '@modules/notification/notification.module'
import { PaymentModule } from '@modules/payment/payment.module'
import { ReservationModule } from '@modules/reservation/reservation.module'
import { OrderModule } from '@modules/order/order.module'

@Module({
  imports: [
    CampaignModule,
    NotificationModule,
    PaymentModule,
    ReservationModule,
    OrderModule
  ],
  controllers: [AdminController, AdminStreamController, BenchmarkController],
  providers: [
    AdminService,
    BenchmarkService,
    AdminRepository,
    BenchmarkRepository
  ]
})
export class AdminModule {}
