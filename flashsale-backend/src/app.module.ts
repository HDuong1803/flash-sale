import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'

import { AuthModule } from '@modules/auth'
import { NotificationModule } from '@modules/notification'
import { UserModule } from '@modules/user'
import { AdminModule } from '@modules/admin'
import { MerchantModule } from '@modules/merchant'
import { ProductModule } from '@modules/product'
import { CampaignModule } from '@modules/campaign'
import { OrderModule } from '@modules/order'
import { ReservationModule } from '@modules/reservation/reservation.module'
import { WorkersModule } from './workers/workers.module'
import { CheckoutModule } from '@modules/checkout/checkout.module'
import { PaymentModule } from '@modules/payment/payment.module'
import { SchedulerModule } from '@modules/scheduler/scheduler.module'
import { DashboardModule } from '@modules/dashboard/dashboard.module'

import { CommonModule } from './common'
import { configuration } from './config'
import { HealthModule } from './health'
import { PrismaModule } from './infrastructure/prisma'
import { RedisModule } from './infrastructure/redis'
import { RabbitMQModule } from './infrastructure/rabbitmq'
import { RequestMiddleware, LoggerMiddleware } from '@common/middleware'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration]
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    RabbitMQModule,
    CommonModule,
    HealthModule,
    AuthModule,
    UserModule,
    AdminModule,
    NotificationModule,
    MerchantModule,
    ProductModule,
    CampaignModule,
    OrderModule,
    ReservationModule,
    WorkersModule,
    CheckoutModule,
    PaymentModule,
    SchedulerModule,
    DashboardModule
  ]
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware, RequestMiddleware).forRoutes('*')
  }
}
