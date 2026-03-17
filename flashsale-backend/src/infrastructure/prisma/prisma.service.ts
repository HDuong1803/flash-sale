import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient, UserRole, UserStatus } from '@prisma/client'
import * as bcrypt from 'bcrypt'

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name)

  constructor(private configService: ConfigService) {
    super({
      // Connection pooling configuration optimized for pgpool/pgbouncer
      datasources: {
        db: {
          url: configService.get('DATABASE_URL')
        }
      },
      // Logging configuration for development/production
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'info', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' }
      ],
      // Connection timeout and retry settings
      errorFormat: 'pretty'
    })

    // Error handling for connection issues
    this.$on('error', e => {
      this.logger.error('Database error:', e)
    })
  }

  async onModuleInit() {
    try {
      this.logger.log('Connecting to PostgreSQL database...')
      await this.$connect()

      // Test database connection
      await this.$queryRaw`SELECT 1`
      this.logger.log('✅ Database connection established successfully')

      // Log connection pool info
      const connectionInfo = await this.$queryRaw`
        SELECT 
          current_database() as database,
          current_user as user,
          inet_server_addr() as host,
          inet_server_port() as port
      `
      this.logger.log('Database info:', connectionInfo)

      await this.seedDefaultAdmin()
    } catch (error) {
      this.logger.error('❌ Failed to connect to database:', error)
      throw error
    }
  }

  private async seedDefaultAdmin(): Promise<void> {
    const email = this.configService.get<string>('ADMIN_EMAIL')
    const password = this.configService.get<string>('ADMIN_PASSWORD')
    const fullName = this.configService.get<string>('ADMIN_NAME')

    const existing = await this.user.findUnique({ where: { email } })
    if (existing) {
      this.logger.log(`Admin account already exists (${email}), skipping seed`)
      return
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await this.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE
      }
    })
    this.logger.log(`✅ Default admin created: ${email}`)
  }

  async onModuleDestroy() {
    try {
      this.logger.log('Disconnecting from database...')
      await this.$disconnect()
      this.logger.log('✅ Database disconnected successfully')
    } catch (error: any) {
      this.logger.error('Error disconnecting from database:', error)
    }
  }

  // Health check method for monitoring
  async healthCheck(): Promise<{ status: string; timestamp: Date }> {
    try {
      await this.$queryRaw`SELECT 1`
      return {
        status: 'healthy',
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Database health check failed:', error)
      throw new Error('Database connection unhealthy')
    }
  }

  // Connection pool status
  async getConnectionPoolStatus() {
    try {
      const poolStats = await this.$queryRaw`
        SELECT 
          count(*) as total_connections,
          count(*) filter (where state = 'active') as active_connections,
          count(*) filter (where state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `
      return poolStats
    } catch (error: any) {
      this.logger.error('Failed to get connection pool status:', error)
      return null
    }
  }

  // Transaction helper with retry logic
  async transaction<T>(
    fn: (prisma: PrismaService) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.$transaction(
          async prisma => {
            return await fn(prisma as PrismaService)
          },
          {
            maxWait: 10000, // 10 seconds
            timeout: 30000 // 30 seconds
          }
        )
      } catch (error: any) {
        lastError = error
        this.logger.warn(
          `Transaction attempt ${attempt} failed:`,
          error.message
        )

        if (attempt === maxRetries) {
          this.logger.error(`Transaction failed after ${maxRetries} attempts`)
          throw lastError
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        )
      }
    }

    throw lastError
  }
}
