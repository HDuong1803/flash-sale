import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { RedisService } from '@infrastructure/redis/redis.service'
import { FulfillmentRepository } from '../repositories/fulfillment.repository'

/**
 * FulfillmentSlaService — Cron job phát hiện và đánh dấu SLA breach.
 *
 * Chạy mỗi 5 phút:
 * 1. Tìm các FulfillmentOrder sắp vi phạm SLA (approaching) → publish cảnh báo SSE
 * 2. Tìm các FulfillmentOrder đã vi phạm SLA (deadline quá hạn) → mark slaBreached = true + publish SSE
 *
 * Lock cơ chế: acquireLockToken (token-based Redis lock) để tránh duplicate run
 * khi có nhiều instance backend.
 *
 * SSE channel: `dashboard:admin` — admin dashboard listen kênh này để nhận alert.
 */
@Injectable()
export class FulfillmentSlaService {
  private readonly logger = new Logger(FulfillmentSlaService.name)

  constructor(
    private readonly fulfillmentRepo: FulfillmentRepository,
    private readonly redis: RedisService
  ) {}

  /** Mỗi 5 phút — kiểm tra SLA breaches */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkSlaBreaches(): Promise<void> {
    const token = await this.redis.acquireLockToken(
      'scheduler:slaBreachCheck',
      270_000 // 4.5 phút — nhỏ hơn interval để tránh overlap
    )
    if (!token) return

    try {
      await this.detectAndMarkBreaches()
      await this.alertApproachingDeadlines()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`SLA breach check failed: ${message}`)
    } finally {
      await this.redis.releaseLockToken('scheduler:slaBreachCheck', token)
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * detectAndMarkBreaches — Tìm orders đã quá SLA deadline, mark và publish SSE.
   */
  private async detectAndMarkBreaches(): Promise<void> {
    const now = new Date()
    const breachedOrders = await this.fulfillmentRepo.findBreachedOrders(now)

    if (breachedOrders.length === 0) return

    const ids = breachedOrders.map(o => o.id)
    await this.fulfillmentRepo.markSlaBreachedBatch(ids)

    for (const order of breachedOrders) {
      this.logger.warn(
        `SLA BREACH: fulfillmentId=${order.id} orderId=${
          order.orderId
        } deadline=${order.slaDeadline?.toISOString()}`
      )

      await this.publishSlaEvent('SLA_BREACH', {
        fulfillmentId: order.id,
        orderId: order.orderId,
        fulfillStatus: order.fulfillStatus,
        slaDeadline: order.slaDeadline?.toISOString() ?? null,
        breachedAt: now.toISOString()
      })
    }

    this.logger.log(`Marked ${breachedOrders.length} SLA breaches`)
  }

  /**
   * alertApproachingDeadlines — Cảnh báo orders sắp vi phạm SLA (trong 2 giờ).
   */
  private async alertApproachingDeadlines(): Promise<void> {
    const windowMs = 2 * 60 * 60 * 1000 // 2 giờ
    const approachingOrders =
      await this.fulfillmentRepo.findOrdersApproachingSlaDeadline(windowMs)

    for (const order of approachingOrders) {
      await this.publishSlaEvent('SLA_WARNING', {
        fulfillmentId: order.id,
        orderId: order.orderId,
        fulfillStatus: order.fulfillStatus,
        slaDeadline: order.slaDeadline?.toISOString() ?? null
      })
    }

    if (approachingOrders.length > 0) {
      this.logger.log(
        `${approachingOrders.length} orders approaching SLA deadline`
      )
    }
  }

  /**
   * publishSlaEvent — Publish event lên Redis pub/sub → SSE admin dashboard.
   * Channel: dashboard:admin — admin có thể subscribe để nhận real-time alerts.
   */
  private async publishSlaEvent(
    type: 'SLA_BREACH' | 'SLA_WARNING',
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.redis.client.publish(
        'dashboard:admin',
        JSON.stringify({ type, ...payload })
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to publish SLA event: ${message}`)
    }
  }
}
