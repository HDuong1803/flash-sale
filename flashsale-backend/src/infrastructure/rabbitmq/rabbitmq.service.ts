import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common'
import * as amqplib from 'amqplib'

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name)
  private connection: amqplib.ChannelModel
  private channel: amqplib.Channel

  async onModuleInit(): Promise<void> {
    const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672'
    try {
      this.connection = await amqplib.connect(url)
      this.channel = await this.connection.createChannel()
      await this.setupQueues()
      this.logger.log('RabbitMQ connected')
    } catch (err) {
      this.logger.error('RabbitMQ connection failed', err)
    }
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

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close()
    await this.connection?.close()
  }
}
