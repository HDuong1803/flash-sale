import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend, CreateEmailOptions } from 'resend'
import { IEmailProvider, SendEmailParams } from '../interfaces/email.interface'

@Injectable()
export class ResendEmailProvider implements IEmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name)
  private readonly client: Resend

  constructor(private readonly configService: ConfigService) {
    const apiKey =
      this.configService.get<string>('postmark.RESEND_API_KEY') ?? ''
    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY không được cấu hình. Sẽ không thể gửi email.'
      )
    }
    this.client = new Resend(apiKey)
  }

  async sendEmail(params: SendEmailParams): Promise<void> {
    const emailParams: CreateEmailOptions = {
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html
    }
    const { error } = await this.client.emails.send(emailParams)
    if (error) {
      this.logger.error(`Lỗi khi gửi email đến ${params.to}: ${error.message}`)
      throw new Error(`Lỗi khi gửi email: ${error.message}`)
    }
    this.logger.log(`Email đã gửi đến ${params.to}`)
  }
}
