import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'
import { IEmailProvider, SendEmailParams } from '../interfaces/email.interface'

/**
 * Resend email provider implementation
 */
@Injectable()
export class ResendEmailProvider implements IEmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name)
  private readonly client: Resend

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('postmark.RESEND_API_KEY', '')

    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured')
    }

    this.client = new Resend(apiKey)
  }

  async sendEmail(params: SendEmailParams): Promise<void> {
    try {
      const emailParams: any = {
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html
      }

      if (params.cc) {
        emailParams.cc = params.cc
      }

      await this.client.emails.send(emailParams)

      this.logger.log(`Email sent via Resend to ${params.to}`)
    } catch (error) {
      this.logger.error(
        `Failed to send email via Resend: ${error.message}`,
        error.stack
      )
      throw new Error(`Resend send failed: ${error.message}`)
    }
  }
}
