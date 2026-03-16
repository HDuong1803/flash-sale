/**
 * Email provider interface for SOLID architecture
 * Allows switching between different email providers (Postmark, Resend, etc.)
 */
export interface IEmailProvider {
  /**
   * Send an email using the provider
   */
  sendEmail(params: SendEmailParams): Promise<void>
}

/**
 * Parameters for sending email
 */
export interface SendEmailParams {
  from: string
  to: string
  cc?: string
  subject: string
  html: string
}

/**
 * Template context for EJS rendering
 */
export interface EmailTemplateContext {
  [key: string]: any
}

/**
 * Email template types
 */
export enum EmailTemplate {
  REGISTRATION_CONFIRMATION = 'registration-confirmation',
  USER_LINK_EMAIL = 'user-link-email',
  PASSWORD_RESET = 'password-reset',
  USER_LINK_WALLET = 'user-link-wallet',
  DOCUMENT_TO_SIGN = 'document-to-sign',
  PACKAGE_TO_SIGN = 'package-to-sign',
  CONTRACT_APPROVAL_NOTIFICATION = 'contract-approval-notification',
  REJECT_SIGN_DOCUMENT = 'reject-sign-document',
  SIGN_DOCUMENT_SUCCESS = 'sign-document-success',
  MODIFICATION_REQUEST = 'modification-request',
  SECTION_SUGGESTION = 'section-suggestion',
  USER_CHANGE_PASSWORD = 'user-change-password',
  WELCOME_TO_CORPORATION = 'welcome-to-corporation',
  SEND_CONTRACT_TO_EMPLOYEE_BY_ROLE = 'send-contract-to-employee-by-role',
  ACCOUNT_TO_NEW_EMPLOYEE = 'account-to-new-employee',
  APPROVED_KYC = 'approved-kyc',
  REJECTED_KYC = 'rejected-kyc',
  // Workflow templates
  DOCUMENT_REVIEW_DONE = 'document-review-done',
  DOCUMENT_REJECTED = 'document-rejected',
  DOCUMENT_UPDATE_REQUEST = 'document-update-request'
}

/**
 * Email provider types
 */
export enum EmailProviderType {
  POSTMARK = 'postmark',
  RESEND = 'resend'
}
