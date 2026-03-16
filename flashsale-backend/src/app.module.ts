import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'

import { AuthModule } from '@modules/auth'
import { NotificationModule } from '@modules/notification'
import { UserModule } from '@modules/user'
import { AdminModule } from '@modules/admin'
import { MerchantModule } from '@modules/merchant'
import { ProductModule } from '@modules/product'

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
    ProductModule
  ]
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware, RequestMiddleware).forRoutes('*')
  }
}
