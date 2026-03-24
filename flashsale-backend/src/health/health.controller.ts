import { Controller, Get } from '@nestjs/common'
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator
} from '@nestjs/terminus'
import { Public } from '@common/decorators/public.decorator'
import { PrismaService } from '@infrastructure/prisma/prisma.service'
import { RedisService } from '@infrastructure/redis/redis.service'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'

/**
 * Health check endpoint — dùng cho:
 * 1. Docker HEALTHCHECK: `curl -f http://localhost:PORT/health`
 * 2. Load balancer probe (AWS ALB, Nginx, ...)
 * 3. Kubernetes liveness + readiness probes
 * 4. Uptime monitoring (UptimeRobot, Pingdom, ...)
 *
 * Endpoint không yêu cầu auth vì load balancer cần gọi trực tiếp.
 *
 * Response shape (NestJS terminus standard):
 * {
 *   status: 'ok' | 'error',
 *   info: { [key]: { status: 'up' | 'down' } },
 *   error: { [key]: { status: 'down', message: string } },
 *   details: { [key]: { status, ... } }
 * }
 *
 * HTTP status: 200 nếu tất cả UP, 503 nếu có dependency DOWN.
 * Load balancer sẽ loại instance khỏi pool nếu nhận 503.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService
  ) {}

  @Get('health')
  @Public()
  @HealthCheck()
  async check() {
    return this.health.check([
      // ─── PostgreSQL ──────────────────────────────────────────────────────
      // Dùng PrismaHealthIndicator — chạy SELECT 1 để verify kết nối
      // Timeout 3s: nếu DB không phản hồi trong 3s → báo DOWN
      () =>
        this.prismaIndicator.pingCheck('database', this.prisma, {
          timeout: 3000
        }),

      // ─── Redis ───────────────────────────────────────────────────────────
      // Custom indicator: gọi PING trực tiếp qua ioredis client
      () => this.checkRedis(),

      // ─── RabbitMQ ────────────────────────────────────────────────────────
      // Custom indicator: kiểm tra channel còn open
      () => this.checkRabbitMQ(),

      // ─── Memory ──────────────────────────────────────────────────────────
      // Cảnh báo nếu heap > 512MB — giúp phát hiện memory leak sớm
      // Giá trị tham khảo: container thường được cấp 512MB-1GB RAM
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),

      // RSS (Resident Set Size): tổng memory process đang dùng (heap + stack + native)
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024)
    ])
  }

  // ─── Legacy endpoint — giữ để không break load balancer cũ ────────────────
  @Get()
  @Public()
  ping() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }

  // ─── Custom health indicators ─────────────────────────────────────────────

  private async checkRedis() {
    const key = 'redis'
    try {
      const pong = await this.redis.client.ping()
      if (pong !== 'PONG') throw new Error(`Unexpected PING response: ${pong}`)
      return { [key]: { status: 'up' as const } }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { [key]: { status: 'down' as const, message } }
    }
  }

  private async checkRabbitMQ() {
    const key = 'rabbitmq'
    try {
      // RabbitMQService expose channel — nếu channel bị đóng → báo DOWN
      const isConnected = this.rabbitmq.isConnected()
      if (!isConnected) throw new Error('RabbitMQ channel is closed')
      return { [key]: { status: 'up' as const } }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { [key]: { status: 'down' as const, message } }
    }
  }
}
