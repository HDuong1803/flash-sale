import { Injectable, Logger } from '@nestjs/common'
import * as ejs from 'ejs'
import * as fs from 'fs'
import * as path from 'path'
import { ConfigService } from './config.service'
import { ResendEmailProvider } from './resend-email.provider'
import { EmailTemplate } from '../interfaces/email.interface'

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
      '[Flash Sale] Bạn đã đăng ký nhận thông báo campaign',
    [EmailTemplate.ORDER_CONFIRMED]: '[Flash Sale] Đặt hàng thành công',
    [EmailTemplate.ORDER_CANCELLED]: '[Flash Sale] Đơn hàng đã bị hủy',
    [EmailTemplate.CAMPAIGN_RESCHEDULE_REQUEST]:
      '[Flash Sale] Yêu cầu thay đổi lịch bắt đầu campaign',
    [EmailTemplate.CAMPAIGN_TIME_CHANGED]:
      '[Flash Sale] Thời gian bắt đầu campaign đã thay đổi'
  }

  constructor(
    private readonly resendProvider: ResendEmailProvider,
    private readonly configService: ConfigService
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

  /** OTP xác minh tài khoản khi đăng ký */
  async sendVerifyOtp(
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
    const frontendUrl = this.configService.get('frontend.FRONTEND_URL')
    await this.send(adminEmail, EmailTemplate.MERCHANT_APPLICATION_ADMIN, {
      merchantName,
      applicantEmail,
      adminUrl: `${frontendUrl}/admin/merchants`
    })
  }

  /** Xác nhận đăng ký nhận thông báo campaign */
  async sendCampaignSubscriptionConfirmed(
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
    const frontendUrl = this.configService.get('frontend.FRONTEND_URL')
    await this.send(params.to, EmailTemplate.ORDER_CONFIRMED, {
      name: params.name,
      orderId: params.orderId,
      productName: params.productName,
      productImage: params.productImage ?? '',
      quantity: params.quantity,
      campaignName: params.campaignName,
      formattedUnitPrice: this.formatCurrency(params.unitPrice),
      formattedTotalPrice: this.formatCurrency(params.totalPrice),
      orderUrl: `${frontendUrl}/orders/${params.orderId}`
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
    const frontendUrl = this.configService.get('frontend.FRONTEND_URL')
    await this.send(params.to, EmailTemplate.ORDER_CANCELLED, {
      name: params.name,
      orderId: params.orderId,
      productName: params.productName,
      reason: params.reason ?? '',
      orderUrl: `${frontendUrl}/orders/${params.orderId}`
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
    await this.send(params.to, EmailTemplate.CAMPAIGN_RESCHEDULE_REQUEST, {
      merchantName: params.merchantName,
      campaignName: params.campaignName,
      newStartTime: params.newStartTime,
      expiresAt: params.expiresAt,
      dashboardUrl: params.dashboardUrl
    })
  }

  /** Gửi email cho subscribers khi thời gian bắt đầu campaign thay đổi */
  async sendCampaignTimeChanged(params: {
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
