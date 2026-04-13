import { Injectable, Logger } from '@nestjs/common'
import * as ejs from 'ejs'
import * as fs from 'fs'
import * as path from 'path'
import { ConfigService } from './config.service'
import { ResendEmailProvider } from './resend-email.provider'
import { EmailTemplate } from '../interfaces/email.interface'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import {
  FAILED_QUEUE_NAMES,
  QUEUE_NAMES
} from '@infrastructure/rabbitmq/rabbitmq.constants'

type EmailJobType =
  | 'VERIFY_OTP'
  | 'RESET_PASSWORD_OTP'
  | 'MERCHANT_APPLICATION_ADMIN'
  | 'CAMPAIGN_SUBSCRIPTION'
  | 'ORDER_CONFIRMED'
  | 'ORDER_CANCELLED'
  | 'CAMPAIGN_RESCHEDULE_REQUEST'
  | 'CAMPAIGN_TIME_CHANGED'

export type EmailJobPayload =
  | {
      type: 'VERIFY_OTP'
      to: string
      name: string
      otp: string
      expiresInMinutes: number
    }
  | {
      type: 'RESET_PASSWORD_OTP'
      to: string
      name: string
      otp: string
      expiresInMinutes: number
    }
  | {
      type: 'MERCHANT_APPLICATION_ADMIN'
      adminEmail: string
      merchantName: string
      applicantEmail: string
    }
  | {
      type: 'CAMPAIGN_SUBSCRIPTION'
      to: string
      name: string
      campaignName: string
      campaignStartTime: string
    }
  | {
      type: 'ORDER_CONFIRMED'
      to: string
      name: string
      orderId: string
      productName: string
      productImage?: string
      quantity: number
      unitPrice: number
      totalPrice: number
      campaignName: string
    }
  | {
      type: 'ORDER_CANCELLED'
      to: string
      name: string
      orderId: string
      productName: string
      reason?: string
    }
  | {
      type: 'CAMPAIGN_RESCHEDULE_REQUEST'
      to: string
      merchantName: string
      campaignName: string
      newStartTime: string
      expiresAt: string
      dashboardUrl: string
    }
  | {
      type: 'CAMPAIGN_TIME_CHANGED'
      to: string
      name: string
      campaignName: string
      oldStartTime: string
      newStartTime: string
    }

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private readonly templatePath: string

  private static readonly SUBJECTS: Record<EmailTemplate, string> = {
    [EmailTemplate.VERIFY_OTP]: '[Flash Sale] Xác minh tài khoản của bạn',
    [EmailTemplate.RESET_PASSWORD_OTP]: '[Flash Sale] Đặt lại mật khẩu',
    [EmailTemplate.MERCHANT_APPLICATION_ADMIN]:
      '[Flash Sale] Đơn đăng ký Merchant mới',
    [EmailTemplate.CAMPAIGN_SUBSCRIPTION]:
      '[Flash Sale] Bạn đã đăng ký nhận thông báo chiến dịch',
    [EmailTemplate.ORDER_CONFIRMED]: '[Flash Sale] Đặt hàng thành công',
    [EmailTemplate.ORDER_CANCELLED]: '[Flash Sale] Đơn hàng đã bị hủy',
    [EmailTemplate.CAMPAIGN_RESCHEDULE_REQUEST]:
      '[Flash Sale] Yêu cầu thay đổi lịch bắt đầu chiến dịch',
    [EmailTemplate.CAMPAIGN_TIME_CHANGED]:
      '[Flash Sale] Thời gian bắt đầu chiến dịch đã thay đổi'
  }

  constructor(
    private readonly resendProvider: ResendEmailProvider,
    private readonly configService: ConfigService,
    private readonly rabbitmq: RabbitMQService
  ) {
    // Dev:  __dirname = src/common/providers  → ../../utils/templates = src/utils/templates
    // Prod: __dirname = dist/src/common/providers → ../../utils/templates = dist/src/utils/templates
    this.templatePath = path.resolve(__dirname, '../../utils/templates')
  }

  private renderTemplate(
    template: EmailTemplate,
    context: Record<string, unknown>
  ): string {
    const templateFile = path.join(this.templatePath, `${template}.ejs`)
    try {
      return ejs.render(fs.readFileSync(templateFile, 'utf-8'), context, {
        views: [this.templatePath],
        filename: templateFile
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Lỗi render template ${template}: ${message}`)
      throw new Error(`Không thể render template email: ${message}`)
    }
  }

  private async send(
    to: string,
    template: EmailTemplate,
    context: Record<string, unknown>
  ): Promise<void> {
    const from = this.configService.get('postmark.SENDER_EMAIL')
    const subject = EmailService.SUBJECTS[template]
    const html = this.renderTemplate(template, context)

    try {
      await this.resendProvider.sendEmail({ from, to, subject, html })
      this.logger.log(`Email [${template}] đã gửi đến ${to}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `Gửi email [${template}] đến ${to} thất bại: ${message}`
      )
      throw new Error(`Gửi email thất bại: ${message}`)
    }
  }

  async processEmailJob(job: EmailJobPayload): Promise<void> {
    switch (job.type) {
      case 'VERIFY_OTP':
        await this.deliverVerifyOtp(
          job.to,
          job.name,
          job.otp,
          job.expiresInMinutes
        )
        return
      case 'RESET_PASSWORD_OTP':
        await this.deliverResetPasswordOtp(
          job.to,
          job.name,
          job.otp,
          job.expiresInMinutes
        )
        return
      case 'MERCHANT_APPLICATION_ADMIN':
        await this.deliverMerchantApplicationNotification(
          job.adminEmail,
          job.merchantName,
          job.applicantEmail
        )
        return
      case 'CAMPAIGN_SUBSCRIPTION':
        await this.deliverCampaignSubscriptionConfirmed(
          job.to,
          job.name,
          job.campaignName,
          job.campaignStartTime
        )
        return
      case 'ORDER_CONFIRMED':
        await this.deliverOrderConfirmed(job)
        return
      case 'ORDER_CANCELLED':
        await this.deliverOrderCancelled(job)
        return
      case 'CAMPAIGN_RESCHEDULE_REQUEST':
        await this.deliverCampaignRescheduleRequest(job)
        return
      case 'CAMPAIGN_TIME_CHANGED':
        await this.deliverCampaignTimeChanged(job)
        return
      default:
        throw new Error(
          `Unsupported email job type: ${String(
            (job as { type?: string }).type
          )}`
        )
    }
  }

  async startEmailConsumer(): Promise<void> {
    await this.rabbitmq.consume(
      QUEUE_NAMES.EMAIL,
      msg => this.processEmailMessage(msg.content.toString()),
      {
        prefetch: 5,
        maxRetries: 5,
        retryDelayMs: 2_000,
        failedQueue: FAILED_QUEUE_NAMES.EMAILS
      }
    )
  }

  private async enqueueEmailJob(
    type: EmailJobType,
    payload: Omit<EmailJobPayload, 'type'>
  ): Promise<void> {
    const published = await this.rabbitmq.publish(QUEUE_NAMES.EMAIL, {
      type,
      ...payload
    })

    if (!published) {
      this.logger.error(`Cannot enqueue email job type=${type}`)
    }
  }

  private async processEmailMessage(raw: string): Promise<void> {
    const job = JSON.parse(raw) as EmailJobPayload
    await this.processEmailJob(job)
  }

  /** OTP xác minh tài khoản khi đăng ký */
  async sendVerifyOtp(
    to: string,
    name: string,
    otp: string,
    expiresInMinutes = 10
  ): Promise<void> {
    await this.enqueueEmailJob('VERIFY_OTP', {
      to,
      name,
      otp,
      expiresInMinutes
    })
  }

  private async deliverVerifyOtp(
    to: string,
    name: string,
    otp: string,
    expiresInMinutes = 10
  ): Promise<void> {
    await this.send(to, EmailTemplate.VERIFY_OTP, {
      name,
      otp,
      expiresInMinutes
    })
  }

  /** OTP đặt lại mật khẩu */
  async sendResetPasswordOtp(
    to: string,
    name: string,
    otp: string,
    expiresInMinutes = 10
  ): Promise<void> {
    await this.enqueueEmailJob('RESET_PASSWORD_OTP', {
      to,
      name,
      otp,
      expiresInMinutes
    })
  }

  private async deliverResetPasswordOtp(
    to: string,
    name: string,
    otp: string,
    expiresInMinutes = 10
  ): Promise<void> {
    await this.send(to, EmailTemplate.RESET_PASSWORD_OTP, {
      name,
      otp,
      expiresInMinutes
    })
  }

  /** Thông báo cho admin khi có đơn đăng ký merchant mới */
  async sendMerchantApplicationNotification(
    adminEmail: string,
    merchantName: string,
    applicantEmail: string
  ): Promise<void> {
    await this.enqueueEmailJob('MERCHANT_APPLICATION_ADMIN', {
      adminEmail,
      merchantName,
      applicantEmail
    })
  }

  private async deliverMerchantApplicationNotification(
    adminEmail: string,
    merchantName: string,
    applicantEmail: string
  ): Promise<void> {
    const clientUrl = this.configService.get('application.CLIENT_URL_SERVER')
    await this.send(adminEmail, EmailTemplate.MERCHANT_APPLICATION_ADMIN, {
      merchantName,
      applicantEmail,
      adminUrl: `${clientUrl}/admin/merchants`
    })
  }

  /** Xác nhận đăng ký nhận thông báo chiến dịch */
  async sendCampaignSubscriptionConfirmed(
    to: string,
    name: string,
    campaignName: string,
    campaignStartTime: string
  ): Promise<void> {
    await this.enqueueEmailJob('CAMPAIGN_SUBSCRIPTION', {
      name,
      to,
      campaignName,
      campaignStartTime
    })
  }

  private async deliverCampaignSubscriptionConfirmed(
    to: string,
    name: string,
    campaignName: string,
    campaignStartTime: string
  ): Promise<void> {
    await this.send(to, EmailTemplate.CAMPAIGN_SUBSCRIPTION, {
      name,
      campaignName,
      campaignStartTime
    })
  }

  /** Thông báo đặt hàng thành công */
  async sendOrderConfirmed(params: {
    to: string
    name: string
    orderId: string
    productName: string
    productImage?: string
    quantity: number
    unitPrice: number
    totalPrice: number
    campaignName: string
  }): Promise<void> {
    await this.enqueueEmailJob('ORDER_CONFIRMED', params)
  }

  private async deliverOrderConfirmed(params: {
    to: string
    name: string
    orderId: string
    productName: string
    productImage?: string
    quantity: number
    unitPrice: number
    totalPrice: number
    campaignName: string
  }): Promise<void> {
    const clientUrl = this.configService.get('application.CLIENT_URL_SERVER')
    await this.send(params.to, EmailTemplate.ORDER_CONFIRMED, {
      name: params.name,
      orderId: params.orderId,
      productName: params.productName,
      productImage: params.productImage ?? '',
      quantity: params.quantity,
      campaignName: params.campaignName,
      formattedUnitPrice: this.formatCurrency(params.unitPrice),
      formattedTotalPrice: this.formatCurrency(params.totalPrice),
      orderUrl: `${clientUrl}/orders/${params.orderId}`
    })
  }

  /** Thông báo đơn hàng bị hủy */
  async sendOrderCancelled(params: {
    to: string
    name: string
    orderId: string
    productName: string
    reason?: string
  }): Promise<void> {
    await this.enqueueEmailJob('ORDER_CANCELLED', params)
  }

  private async deliverOrderCancelled(params: {
    to: string
    name: string
    orderId: string
    productName: string
    reason?: string
  }): Promise<void> {
    const clientUrl = this.configService.get('application.CLIENT_URL_SERVER')
    await this.send(params.to, EmailTemplate.ORDER_CANCELLED, {
      name: params.name,
      orderId: params.orderId,
      productName: params.productName,
      reason: params.reason ?? '',
      orderUrl: `${clientUrl}/orders/${params.orderId}`
    })
  }

  /** Gửi email cho merchant khi admin tạo yêu cầu force reschedule */
  async sendCampaignRescheduleRequest(params: {
    to: string
    merchantName: string
    campaignName: string
    newStartTime: string
    expiresAt: string
    dashboardUrl: string
  }): Promise<void> {
    await this.enqueueEmailJob('CAMPAIGN_RESCHEDULE_REQUEST', params)
  }

  private async deliverCampaignRescheduleRequest(params: {
    to: string
    merchantName: string
    campaignName: string
    newStartTime: string
    expiresAt: string
    dashboardUrl: string
  }): Promise<void> {
    await this.send(params.to, EmailTemplate.CAMPAIGN_RESCHEDULE_REQUEST, {
      merchantName: params.merchantName,
      campaignName: params.campaignName,
      newStartTime: params.newStartTime,
      expiresAt: params.expiresAt,
      dashboardUrl: params.dashboardUrl
    })
  }

  /** Gửi email cho subscribers khi thời gian bắt đầu chiến dịch thay đổi */
  async sendCampaignTimeChanged(params: {
    to: string
    name: string
    campaignName: string
    oldStartTime: string
    newStartTime: string
  }): Promise<void> {
    await this.enqueueEmailJob('CAMPAIGN_TIME_CHANGED', params)
  }

  private async deliverCampaignTimeChanged(params: {
    to: string
    name: string
    campaignName: string
    oldStartTime: string
    newStartTime: string
  }): Promise<void> {
    await this.send(params.to, EmailTemplate.CAMPAIGN_TIME_CHANGED, {
      name: params.name,
      campaignName: params.campaignName,
      oldStartTime: params.oldStartTime,
      newStartTime: params.newStartTime
    })
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }
}
