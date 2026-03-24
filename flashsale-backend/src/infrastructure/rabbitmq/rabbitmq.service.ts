import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqplib from 'amqplib'

/** Max delay between reconnect attempts */
const MAX_RECONNECT_DELAY_MS = 30_000

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name)
  private connection: amqplib.ChannelModel
  private channel: amqplib.Channel
  private reconnectAttempts = 0
  private isShuttingDown = false

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect()
  }

  private async connect(): Promise<void> {
    const url = this.configService.get<string>('rabbitmq.RABBITMQ_URL', 'amqp://localhost:5672')
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
        // this.scheduleReconnect // TODO: bật lại khi deploy
      })

      this.channel.on('error', (err: Error) => {
        this.logger.error(`RabbitMQ channel error: ${err.message}`)
      })

      this.channel.on('close', () => {
        if (this.isShuttingDown) return
        this.logger.warn('RabbitMQ channel closed — scheduling reconnect')
        // this.scheduleReconnect()
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`RabbitMQ connection failed: ${message}`)
      // this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) return
    this.reconnectAttempts++
    const delay = Math.min(
      1_000 * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    )
    this.logger.warn(
      `RabbitMQ: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    )
    setTimeout(() => {
      void this.connect()
    }, delay)
  }

  private async setupQueues(): Promise<void> {
    await this.channel.assertExchange('failed_orders', 'direct', {
      durable: true
    })
    await this.channel.assertQueue('order.high', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'failed_orders' }
    })
    await this.channel.assertQueue('order.normal', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'failed_orders' }
    })
    await this.channel.assertQueue('failed_orders', { durable: true })
    await this.channel.bindQueue('failed_orders', 'failed_orders', '')
    await this.channel.assertQueue('notification', { durable: true })
  }

  async publish(queue: string, message: object): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn(`Cannot publish to ${queue}: channel not ready`)
      return false
    }
    const content = Buffer.from(JSON.stringify(message))
    return this.channel.sendToQueue(queue, content, { persistent: true })
  }

  async consume(
    queue: string,
    handler: (msg: amqplib.ConsumeMessage) => Promise<void>,
    prefetch = 1
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn(`Cannot consume ${queue}: channel not ready`)
      return
    }
    await this.channel.prefetch(prefetch)
    await this.channel.consume(queue, async msg => {
      if (!msg) return
      try {
        await handler(msg)
        this.channel.ack(msg)
      } catch (err) {
        this.logger.error(`Error processing message from ${queue}`, err)
        const retries = (msg.properties.headers?.['x-retry-count'] ??
          0) as number
        if (retries >= 3) {
          this.channel.nack(msg, false, false)
        } else {
          this.channel.nack(msg, false, true)
        }
      }
    })
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
