import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { EmailService } from '@common/providers/email.service'

@Injectable()
export class EmailWorker implements OnModuleInit {
  private readonly logger = new Logger(EmailWorker.name)

  constructor(private readonly emailService: EmailService) {}

  async onModuleInit(): Promise<void> {
    await this.emailService.startEmailConsumer()
    this.logger.log('Email Worker started — consuming email queue')
  }
}
