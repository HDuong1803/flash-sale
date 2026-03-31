export interface IEmailProvider {
  sendEmail(params: SendEmailParams): Promise<void>
}

export interface SendEmailParams {
  from: string
  to: string
  subject: string
  html: string
}

export enum EmailTemplate {
  VERIFY_OTP = 'verify-otp',
  RESET_PASSWORD_OTP = 'reset-password-otp',
  MERCHANT_APPLICATION_ADMIN = 'merchant-application-admin',
  CAMPAIGN_SUBSCRIPTION = 'campaign-subscription',
  ORDER_CONFIRMED = 'order-confirmed',
  ORDER_CANCELLED = 'order-cancelled',
  CAMPAIGN_RESCHEDULE_REQUEST = 'campaign-reschedule-request',
  CAMPAIGN_TIME_CHANGED = 'campaign-time-changed'
}
