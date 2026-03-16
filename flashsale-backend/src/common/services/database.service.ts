import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '@local-prisma/prisma.service'
import { DatabaseConfig } from '@config/database.config'

export interface ConnectionPoolStats {
  totalConnections: number
  activeConnections: number
  idleConnections: number
  waitingConnections: number
  maxConnections: number
  averageWaitTime: number
  totalQueries: number
  slowQueries: number
}

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name)
  private readonly config: DatabaseConfig
  private connectionStats: ConnectionPoolStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    waitingConnections: 0,
    maxConnections: 0,
    averageWaitTime: 0,
    totalQueries: 0,
    slowQueries: 0
  }

  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService
  ) {
    this.config = {
      url: this.configService.get('DATABASE_URL'),
      directUrl: this.configService.get('DIRECT_DATABASE_URL'),
      connectionLimit: parseInt(
        this.configService.get('DB_CONNECTION_LIMIT') || '20'
      ),
      connectionTimeout: parseInt(
        this.configService.get('DB_CONNECTION_TIMEOUT') || '10000'
      ),
      idleTimeout: parseInt(
        this.configService.get('DB_IDLE_TIMEOUT') || '30000'
      ),
      maxLifetime: parseInt(
        this.configService.get('DB_MAX_LIFETIME') || '3600000'
      ),
      retryAttempts: parseInt(
        this.configService.get('DB_RETRY_ATTEMPTS') || '3'
      ),
      retryDelay: parseInt(this.configService.get('DB_RETRY_DELAY') || '1000'),
      enableQueryLogging: this.configService.get('NODE_ENV') === 'development',
      slowQueryThreshold: parseInt(
        this.configService.get('DB_SLOW_QUERY_THRESHOLD') || '1000'
      ),
      ssl: {
        enabled: this.configService.get('DB_SSL_ENABLED') === 'true',
        rejectUnauthorized:
          this.configService.get('DB_SSL_REJECT_UNAUTHORIZED') !== 'false',
        ca: this.configService.get('DB_SSL_CA'),
        cert: this.configService.get('DB_SSL_CERT'),
        key: this.configService.get('DB_SSL_KEY')
      }
    }
  }

  /**
   * Get comprehensive connection pool statistics
   */
  async getConnectionPoolStats(): Promise<ConnectionPoolStats> {
    try {
      // Get PostgreSQL connection stats
      const pgStats = (await this.prismaService.$queryRaw`
        SELECT 
          count(*) as total_connections,
          count(*) filter (where state = 'active') as active_connections,
          count(*) filter (where state = 'idle') as idle_connections,
          count(*) filter (where state = 'idle in transaction') as waiting_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `) as any[]

      // Get database settings
      const dbSettings = (await this.prismaService.$queryRaw`
        SELECT name, setting, unit 
        FROM pg_settings 
        WHERE name IN ('max_connections', 'shared_buffers', 'effective_cache_size')
      `) as any[]

      // Get query statistics
      const queryStats = (await this.prismaService.$queryRaw`
        SELECT 
          calls as total_queries,
          mean_exec_time,
          stddev_exec_time
        FROM pg_stat_statements 
        ORDER BY calls DESC 
        LIMIT 1
      `) as any[]

      const stats = pgStats[0]
      const maxConn = dbSettings.find(s => s.name === 'max_connections')

      this.connectionStats = {
        totalConnections: parseInt(stats.total_connections),
        activeConnections: parseInt(stats.active_connections),
        idleConnections: parseInt(stats.idle_connections),
        waitingConnections: parseInt(stats.waiting_connections),
        maxConnections: maxConn ? parseInt(maxConn.setting) : 0,
        averageWaitTime: queryStats[0]
          ? parseFloat(queryStats[0].mean_exec_time)
          : 0,
        totalQueries: queryStats[0] ? parseInt(queryStats[0].total_queries) : 0,
        slowQueries: 0 // Will be calculated based on threshold
      }

      return this.connectionStats
    } catch (error) {
      this.logger.error('Failed to get connection pool stats:', error)
      return this.connectionStats
    }
  }

  /**
   * Monitor connection pool health
   */
  async monitorConnectionPool(): Promise<{
    status: 'healthy' | 'warning' | 'critical'
    message: string
    stats: ConnectionPoolStats
  }> {
    const stats = await this.getConnectionPoolStats()

    const utilizationRate = stats.totalConnections / stats.maxConnections

    let status: 'healthy' | 'warning' | 'critical' = 'healthy'
    let message = 'Connection pool is healthy'

    if (utilizationRate > 0.9) {
      status = 'critical'
      message = `Connection pool utilization is critical: ${(
        utilizationRate * 100
      ).toFixed(1)}%`
    } else if (utilizationRate > 0.7) {
      status = 'warning'
      message = `Connection pool utilization is high: ${(
        utilizationRate * 100
      ).toFixed(1)}%`
    }

    if (stats.averageWaitTime > this.config.slowQueryThreshold) {
      status = status === 'critical' ? 'critical' : 'warning'
      message += `. Average query time is high: ${stats.averageWaitTime.toFixed(
        2
      )}ms`
    }

    this.logger.debug(`Connection pool status: ${status} - ${message}`)

    return { status, message, stats }
  }

  /**
   * Test database connectivity with retry logic
   */
  async testConnection(maxRetries = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.prismaService.$queryRaw`SELECT 1 as test`
        this.logger.log(
          `✅ Database connection test successful (attempt ${attempt})`
        )
        return true
      } catch (error) {
        this.logger.error(
          `❌ Database connection test failed (attempt ${attempt}):`,
          error.message
        )

        if (attempt === maxRetries) {
          return false
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    return false
  }

  /**
   * Execute raw SQL with connection pool management
   */
  async executeRawQuery<T = any>(
    query: string,
    params: any[] = []
  ): Promise<T[]> {
    const startTime = Date.now()

    try {
      const result = await this.prismaService.$queryRawUnsafe(query, ...params)
      const duration = Date.now() - startTime

      if (duration > this.config.slowQueryThreshold) {
        this.logger.warn(`Slow query detected (${duration}ms): ${query}`)
        this.connectionStats.slowQueries++
      }

      this.connectionStats.totalQueries++

      return result as T[]
    } catch (error) {
      this.logger.error(`Query execution failed: ${query}`, error)
      throw error
    }
  }

  /**
   * Get database version and configuration info
   */
  async getDatabaseInfo(): Promise<{
    version: string
    encoding: string
    timezone: string
    maxConnections: number
    sharedBuffers: string
    effectiveCacheSize: string
  }> {
    try {
      const versionResult = (await this.prismaService
        .$queryRaw`SELECT version()`) as any[]
      const configResult = (await this.prismaService.$queryRaw`
        SELECT name, setting, unit 
        FROM pg_settings 
        WHERE name IN (
          'server_encoding', 
          'timezone', 
          'max_connections', 
          'shared_buffers', 
          'effective_cache_size'
        )
      `) as any[]

      const config = configResult.reduce((acc, row) => {
        acc[row.name] = row.unit ? `${row.setting}${row.unit}` : row.setting
        return acc
      }, {})

      return {
        version: versionResult[0].version,
        encoding: config.server_encoding || 'UTF8',
        timezone: config.timezone || 'UTC',
        maxConnections: parseInt(config.max_connections || '100'),
        sharedBuffers: config.shared_buffers || '128MB',
        effectiveCacheSize: config.effective_cache_size || '4GB'
      }
    } catch (error) {
      this.logger.error('Failed to get database info:', error)
      throw error
    }
  }

  /**
   * Clean up idle connections
   */
  async cleanupIdleConnections(): Promise<number> {
    try {
      const result = (await this.prismaService.$queryRaw`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE state = 'idle' 
        AND state_change < now() - interval '1 hour'
        AND datname = current_database()
        AND pid <> pg_backend_pid()
      `) as any[]

      const terminated = result.length
      this.logger.log(`Terminated ${terminated} idle connections`)
      return terminated
    } catch (error) {
      this.logger.error('Failed to cleanup idle connections:', error)
      return 0
    }
  }

  /**
   * Get configuration object for external use
   */
  getConfig(): DatabaseConfig {
    return { ...this.config }
  }
}
