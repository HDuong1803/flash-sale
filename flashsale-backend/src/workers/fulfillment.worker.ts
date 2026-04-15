import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as amqplib from 'amqplib'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import {
  FAILED_QUEUE_NAMES,
  QUEUE_NAMES
} from '@infrastructure/rabbitmq/rabbitmq.constants'
import { FulfillmentService } from '@modules/fulfillment/services/fulfillment.service'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabelJob {
  orderId: string
  /** Weight in grams — optional, default 500g */
  weightGrams?: number
  /** Dimensions in cm */
  dimensionsCm?: { l: number; w: number; h: number }
  /** Timestamp lúc publish (Unix ms) — để detect stale jobs */
  timestamp: number
}

/**
 * FulfillmentWorker — Async label booking consumer.
 *
 * Architecture:
 * - QC Station publish job vào `fulfillment.label` sau khi pass QC
 * - Worker gọi FulfillmentService.bookLabel() — idempotent
 * - Stale jobs (>24h) → ack và skip (không retry)
 * - Failure → throw để RabbitMQService handle retry + dead-letter
 *
 * Design: tách label booking ra async queue vì EasyPost API có thể
 * mất 1-3s, không nên block QC station HTTP response.
 */
@Injectable()
export class FulfillmentWorker implements OnModuleInit {
  private readonly logger = new Logger(FulfillmentWorker.name)
  /** Stale threshold: 24 giờ — job cũ hơn 24h sẽ bị skip và ack */
  private readonly staleThresholdMs = 24 * 60 * 60 * 1000

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly fulfillmentService: FulfillmentService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitmq.consume(
      QUEUE_NAMES.FULFILLMENT_LABEL,
      msg => this.processLabelJob(msg),
      {
        prefetch: 5, // label booking is I/O bound — can handle 5 concurrently
        failedQueue: FAILED_QUEUE_NAMES.FULFILLMENT
      }
    )
    this.logger.log('FulfillmentWorker started — consuming fulfillment.label')
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async processLabelJob(msg: amqplib.ConsumeMessage): Promise<void> {
    const job = this.parseJob(msg)

    // Stale check: ack without processing (không retry stale jobs)
    if (Date.now() - job.timestamp > this.staleThresholdMs) {
      this.logger.warn(
        `Skipping stale fulfillment job orderId=${job.orderId} ` +
          `(age=${Math.floor((Date.now() - job.timestamp) / 60_000)}min)`
      )
      return // RabbitMQService sẽ ack
    }

    this.logger.debug(`Processing label job orderId=${job.orderId}`)

    await this.fulfillmentService.bookLabel({
      orderId: job.orderId,
      weightGrams: job.weightGrams,
      dimensionsCm: job.dimensionsCm
    })

    this.logger.log(`Label booked async for orderId=${job.orderId}`)
    // Return bình thường → RabbitMQService tự ack
  }

  private parseJob(msg: amqplib.ConsumeMessage): LabelJob {
    const content = msg.content.toString()
    const parsed = JSON.parse(content) as unknown

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Job payload must be an object')
    }

    const obj = parsed as Record<string, unknown>

    if (typeof obj['orderId'] !== 'string' || !obj['orderId']) {
      throw new Error('Job missing required field: orderId (string)')
    }
    if (typeof obj['timestamp'] !== 'number') {
      throw new Error('Job missing required field: timestamp (number)')
    }

    const dimensionsCm =
      obj['dimensionsCm'] &&
      typeof obj['dimensionsCm'] === 'object' &&
      'l' in (obj['dimensionsCm'] as object) &&
      'w' in (obj['dimensionsCm'] as object) &&
      'h' in (obj['dimensionsCm'] as object)
        ? (obj['dimensionsCm'] as { l: number; w: number; h: number })
        : undefined

    return {
      orderId: obj['orderId'],
      weightGrams:
        typeof obj['weightGrams'] === 'number' ? obj['weightGrams'] : undefined,
      dimensionsCm,
      timestamp: obj['timestamp']
    }
  }
}
