import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { TelegramNotificationService } from '@modules/notification/services/telegram-notification.service'

@Injectable()
export class TelegramWorker implements OnModuleInit {
  private readonly logger = new Logger(TelegramWorker.name)

  constructor(
    private readonly telegramNotificationService: TelegramNotificationService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.telegramNotificationService.startTelegramConsumer()
    this.logger.log('Telegram Worker started — consuming telegram queue')
  }
}
