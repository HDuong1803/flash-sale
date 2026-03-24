import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { PrismaModule } from '@infrastructure/prisma'
import { RedisModule } from '@infrastructure/redis'
import { RabbitMQModule } from '@infrastructure/rabbitmq'
import { HealthController } from './health.controller'

@Module({
  imports: [
    // TerminusModule cung cấp HealthCheckService, MemoryHealthIndicator,
    // PrismaHealthIndicator và các built-in health indicators
    TerminusModule,
    // Infrastructure modules để controller có thể inject services
    PrismaModule,
    RedisModule,
    RabbitMQModule
  ],
  controllers: [HealthController]
})
export class HealthModule {}
