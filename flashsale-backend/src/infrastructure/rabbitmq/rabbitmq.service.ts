import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqplib from 'amqplib'
import {
  FAILED_QUEUE_NAMES,
  QUEUE_NAMES,
  RETRY_HEADER
} from './rabbitmq.constants'

/** Max delay between reconnect attempts */
const MAX_RECONNECT_DELAY_MS = 30_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 1_000

interface PublishOptions {
  headers?: Record<string, unknown>
  expirationMs?: number
}

interface ConsumeOptions {
  prefetch?: number
  maxRetries?: number
  retryDelayMs?: number
  failedQueue?: string
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name)
  private connection: amqplib.ChannelModel
  private channel: amqplib.Channel
  private reconnectAttempts = 0

  private isReconnecting = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private isShuttingDown = false

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect()
  }

  private async connect(): Promise<void> {
    const url = this.configService.get<string>(
      'rabbitmq.RABBITMQ_URL',
      'amqp://localhost:5672'
    )
    try {
      this.connection = await amqplib.connect(url)
      this.channel = await this.connection.createChannel()
      await this.setupQueues()
      this.reconnectAttempts = 0
      this.logger.log('RabbitMQ connected')

      // Re-register listeners every time we get a fresh connection/channel
      this.connection.on('error', (err: Error) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`)
      })

      this.connection.on('close', () => {
        if (this.isShuttingDown) return
        this.logger.warn('RabbitMQ connection closed — scheduling reconnect')
        this.scheduleReconnect()
      })

      this.channel.on('error', (err: Error) => {
        this.logger.error(`RabbitMQ channel error: ${err.message}`)
      })

      this.channel.on('close', () => {
        if (this.isShuttingDown) return
        this.logger.warn('RabbitMQ channel closed — scheduling reconnect')
        this.scheduleReconnect()
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`RabbitMQ connection failed: ${message}`)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.isReconnecting) return
    this.isReconnecting = true
    this.reconnectAttempts++

    const delay = Math.min(
      1_000 * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    )
    this.logger.warn(
      `RabbitMQ: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    )

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private async setupQueues(): Promise<void> {
    await this.channel.assertExchange(FAILED_QUEUE_NAMES.ORDERS, 'direct', {
      durable: true
    })
    await this.channel.assertExchange('failed_jobs', 'direct', {
      durable: true
    })
    await this.channel.assertQueue(QUEUE_NAMES.ORDER_HIGH, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': FAILED_QUEUE_NAMES.ORDERS }
    })
    await this.channel.assertQueue(QUEUE_NAMES.ORDER_NORMAL, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': FAILED_QUEUE_NAMES.ORDERS }
    })
    await this.channel.assertQueue(QUEUE_NAMES.NOTIFICATION, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'failed_jobs',
        'x-dead-letter-routing-key': FAILED_QUEUE_NAMES.NOTIFICATIONS
      }
    })
    await this.channel.assertQueue(QUEUE_NAMES.EMAIL, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'failed_jobs',
        'x-dead-letter-routing-key': FAILED_QUEUE_NAMES.EMAILS
      }
    })
    await this.channel.assertQueue(QUEUE_NAMES.TELEGRAM, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'failed_jobs',
        'x-dead-letter-routing-key': FAILED_QUEUE_NAMES.TELEGRAM
      }
    })
    await this.channel.assertQueue(FAILED_QUEUE_NAMES.ORDERS, { durable: true })
    await this.channel.bindQueue(
      FAILED_QUEUE_NAMES.ORDERS,
      FAILED_QUEUE_NAMES.ORDERS,
      ''
    )
    await this.channel.assertQueue(FAILED_QUEUE_NAMES.NOTIFICATIONS, {
      durable: true
    })
    await this.channel.bindQueue(
      FAILED_QUEUE_NAMES.NOTIFICATIONS,
      'failed_jobs',
      FAILED_QUEUE_NAMES.NOTIFICATIONS
    )
    await this.channel.assertQueue(FAILED_QUEUE_NAMES.EMAILS, {
      durable: true
    })
    await this.channel.bindQueue(
      FAILED_QUEUE_NAMES.EMAILS,
      'failed_jobs',
      FAILED_QUEUE_NAMES.EMAILS
    )
    await this.channel.assertQueue(FAILED_QUEUE_NAMES.TELEGRAM, {
      durable: true
    })
    await this.channel.bindQueue(
      FAILED_QUEUE_NAMES.TELEGRAM,
      'failed_jobs',
      FAILED_QUEUE_NAMES.TELEGRAM
    )
    // Fulfillment label queue
    await this.channel.assertQueue(QUEUE_NAMES.FULFILLMENT_LABEL, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'failed_jobs',
        'x-dead-letter-routing-key': FAILED_QUEUE_NAMES.FULFILLMENT
      }
    })
    await this.channel.assertQueue(FAILED_QUEUE_NAMES.FULFILLMENT, {
      durable: true
    })
    await this.channel.bindQueue(
      FAILED_QUEUE_NAMES.FULFILLMENT,
      'failed_jobs',
      FAILED_QUEUE_NAMES.FULFILLMENT
    )
  }

  async publish(
    queue: string,
    message: object,
    options: PublishOptions = {}
  ): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn(`Cannot publish to ${queue}: channel not ready`)
      return false
    }
    const content = Buffer.from(JSON.stringify(message))
    return this.channel.sendToQueue(queue, content, {
      persistent: true,
      headers: options.headers,
      expiration:
        options.expirationMs && options.expirationMs > 0
          ? String(options.expirationMs)
          : undefined
    })
  }

  async consume(
    queue: string,
    handler: (msg: amqplib.ConsumeMessage) => Promise<void>,
    options: ConsumeOptions = {}
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn(`Cannot consume ${queue}: channel not ready`)
      return
    }
    const prefetch = options.prefetch ?? 1
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

    await this.channel.prefetch(prefetch)
    await this.channel.consume(queue, async msg => {
      if (!msg) return
      try {
        await handler(msg)
        this.channel.ack(msg)
      } catch (err) {
        const retries = Number(msg.properties.headers?.[RETRY_HEADER] ?? 0)
        const message = err instanceof Error ? err.message : String(err)

        if (retries >= maxRetries) {
          this.logger.error(
            `Error processing message from ${queue} after ${retries} retries: ${message}`
          )

          if (options.failedQueue) {
            const moved = await this.moveToFailedQueue(
              options.failedQueue,
              queue,
              msg,
              message,
              retries
            )
            if (moved) {
              this.channel.ack(msg)
              return
            }
            this.channel.nack(msg, false, true)
            return
          }

          this.channel.nack(msg, false, false)
          return
        }

        const republished = await this.republishForRetry(
          queue,
          msg,
          retries,
          retryDelayMs
        )

        if (!republished) {
          this.logger.error(
            `Retry publish failed for queue=${queue}, requeueing original message`
          )
          this.channel.nack(msg, false, true)
          return
        }

        this.logger.warn(
          `Retrying message from ${queue} (attempt ${
            retries + 1
          }/${maxRetries})`
        )
        this.channel.ack(msg)
      }
    })
  }

  private async republishForRetry(
    queue: string,
    msg: amqplib.ConsumeMessage,
    retries: number,
    retryDelayMs: number
  ): Promise<boolean> {
    const payload = this.parseMessageContent(msg)
    return this.publish(queue, payload, {
      headers: {
        ...(msg.properties.headers ?? {}),
        [RETRY_HEADER]: retries + 1
      },
      expirationMs: retryDelayMs > 0 ? retryDelayMs : undefined
    })
  }

  private async moveToFailedQueue(
    failedQueue: string,
    sourceQueue: string,
    msg: amqplib.ConsumeMessage,
    errorMessage: string,
    retries: number
  ): Promise<boolean> {
    return this.publish(
      failedQueue,
      {
        sourceQueue,
        failedAt: new Date().toISOString(),
        retries,
        errorMessage,
        payload: this.parseMessageContent(msg)
      },
      {
        headers: {
          sourceQueue,
          [RETRY_HEADER]: retries
        }
      }
    )
  }

  private parseMessageContent(msg: amqplib.ConsumeMessage): object {
    const raw = msg.content.toString()
    try {
      return JSON.parse(raw) as object
    } catch {
      return { raw }
    }
  }

  async getQueueStats(
    queue: string
  ): Promise<{ messageCount: number; consumerCount: number }> {
    if (!this.channel) return { messageCount: 0, consumerCount: 0 }
    const info = await this.channel.checkQueue(queue)
    return {
      messageCount: info.messageCount,
      consumerCount: info.consumerCount
    }
  }

  getChannel(): amqplib.Channel | null {
    return this.channel ?? null
  }

  /**
   * Kiểm tra RabbitMQ có đang kết nối không.
   * Dùng bởi HealthController để probe trạng thái broker.
   */
  isConnected(): boolean {
    return !!this.channel && !!this.connection
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true
    try {
      await this.channel?.close()
    } catch {
      // ignore errors during shutdown
    }
    try {
      await this.connection?.close()
    } catch {
      // ignore errors during shutdown
    }
  }
}
