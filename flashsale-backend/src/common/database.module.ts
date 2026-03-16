import { Module, Global } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { PrismaModule } from '@local-prisma/prisma.module'
import { PrismaService } from '@local-prisma/prisma.service'
import { DatabaseService } from './services/database.service'

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    DatabaseService,
    {
      provide: 'DATABASE_CONFIG',
      useFactory: (configService: ConfigService) => ({
        url: configService.get('DATABASE_URL'),
        directUrl: configService.get('DIRECT_DATABASE_URL'),
        connectionLimit: parseInt(
          configService.get('DB_CONNECTION_LIMIT') || '20'
        ),
        connectionTimeout: parseInt(
          configService.get('DB_CONNECTION_TIMEOUT') || '10000'
        ),
        idleTimeout: parseInt(configService.get('DB_IDLE_TIMEOUT') || '30000'),
        maxLifetime: parseInt(
          configService.get('DB_MAX_LIFETIME') || '3600000'
        ),
        retryAttempts: parseInt(configService.get('DB_RETRY_ATTEMPTS') || '3'),
        retryDelay: parseInt(configService.get('DB_RETRY_DELAY') || '1000'),
        enableQueryLogging: configService.get('NODE_ENV') === 'development',
        slowQueryThreshold: parseInt(
          configService.get('DB_SLOW_QUERY_THRESHOLD') || '1000'
        ),
        ssl: {
          enabled: configService.get('DB_SSL_ENABLED') === 'true',
          rejectUnauthorized:
            configService.get('DB_SSL_REJECT_UNAUTHORIZED') !== 'false'
        }
      }),
      inject: [ConfigService]
    }
  ],
  exports: [PrismaService, DatabaseService, 'DATABASE_CONFIG']
})
export class DatabaseModule {}
