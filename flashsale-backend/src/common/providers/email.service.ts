import { Injectable, Logger } from '@nestjs/common'
import * as ejs from 'ejs'
import * as fs from 'fs'
import * as path from 'path'
import {
  IEmailProvider,
  EmailTemplate,
  EmailTemplateContext,
  EmailProviderType
} from '../interfaces/email.interface'
import { ResendEmailProvider } from './resend-email.provider'
import { ConfigService } from '@nestjs/config'

/**
 * Email Service with SOLID principles
 * Supports multiple email providers (Postmark, Resend) via dependency injection
 * Uses EJS templates for email rendering
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private readonly emailProvider: IEmailProvider
  private readonly defaultFrom: string
  private readonly templatePath: string

  constructor(private readonly configService: ConfigService) {
    // Select email provider based on environment variable
    const providerType =
      (this.configService.get('EMAIL_PROVIDER') as EmailProviderType) ||
      EmailProviderType.POSTMARK

    // Initialize appropriate provider using factory pattern
    this.emailProvider = this.createEmailProvider(providerType)

    // Set default sender
    this.defaultFrom =
      this.configService.get('SENDER_EMAIL') || 'no-reply@decot.io'

    // Set template directory path
    // In Docker: __dirname = /usr/src/app/dist/src/common/providers
    // Target: /usr/src/app/dist/utils/templates
    this.templatePath = path.resolve(__dirname, '../../../utils/templates')
  }

  /**
   * Factory method to create email provider based on type
   */
  private createEmailProvider(type: EmailProviderType): IEmailProvider {
    switch (type) {
      case EmailProviderType.RESEND:
        return new ResendEmailProvider()
    }
  }

  /**
   * Render EJS template with context data
   */
  private async renderTemplate(
    template: EmailTemplate,
    context: EmailTemplateContext
  ): Promise<string> {
    try {
      const templateFile = path.join(this.templatePath, `${template}.ejs`)

      // VALIDATE: All context values MUST be resolved (no Promises allowed)
      for (const [key, value] of Object.entries(context)) {
        if (
          value &&
          typeof value === 'object' &&
          typeof (value as any).then === 'function'
        ) {
          throw new Error(
            `Email context key "${key}" is a Promise. Resolve it before sending email.`
          )
        }
      }

      // Add translate helper function for EJS templates
      const renderContext = {
        ...context,
        translate: (key: string) => {
          // Extract key from $.key format
          const actualKey = key.replace('$.', '')
          const value = context[actualKey]

          if (value === undefined || value === null) {
            return ''
          }

          if (
            typeof value === 'object' &&
            typeof (value as any).then === 'function'
          ) {
            throw new Error(
              `Email context key "${actualKey}" is a Promise. Resolve it before sending email.`
            )
          }

          return String(value)
        }
      }

      // Use sync rendering to ensure all values are resolved immediately
      const html = ejs.render(
        fs.readFileSync(templateFile, 'utf-8'),
        renderContext,
        {
          views: [this.templatePath], // For include() to work
          filename: templateFile // Required for includes to work with sync rendering
        }
      )

      return html
    } catch (error: any) {
      this.logger.error(
        `Failed to render template ${template}: ${error.message}`,
        error.stack
      )
      throw new Error(`Template rendering failed: ${error.message}`)
    }
  }

  /**
   * Send email with template
   */
  private async sendEmailWithTemplate(
    to: string,
    template: EmailTemplate,
    context: EmailTemplateContext,
    cc?: string
  ): Promise<void> {
    try {
      const html = await this.renderTemplate(template, context)

      const renderedSubject = await EmailService.getSubjectByTemplate(
        template,
        context
      )

      await this.emailProvider.sendEmail({
        from: this.defaultFrom,
        to,
        subject: renderedSubject,
        html,
        cc
      })

      this.logger.log(`Email sent to ${to} with template ${template}`)
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${to}: ${error.message}`,
        error.stack
      )
      throw new Error(`Email sending failed: ${error.message}`)
    }
  }

  /**
   * Get email subject by template type
   * Renders subject with EJS to support dynamic values
   */
  private static async getSubjectByTemplate(
    template: EmailTemplate,
    context?: EmailTemplateContext
  ): Promise<string> {
    let subjectTemplate = ''

    if (template === EmailTemplate.REGISTRATION_CONFIRMATION)
      subjectTemplate = 'Welcome to Decot! Confirm Your Registration'
    else if (template === EmailTemplate.PASSWORD_RESET)
      subjectTemplate = 'Reset Your Password for Decot'
    else if (template === EmailTemplate.APPROVED_KYC)
      subjectTemplate = 'Approve KYC for Decot'
    else if (template === EmailTemplate.REJECTED_KYC)
      subjectTemplate = 'Reject KYC for Decot'
    else if (template === EmailTemplate.DOCUMENT_TO_SIGN)
      subjectTemplate = 'Documents to be signed <%= contractName %>'
    else if (template === EmailTemplate.REJECT_SIGN_DOCUMENT)
      subjectTemplate = 'Contract Rejected'
    else if (template === EmailTemplate.USER_CHANGE_PASSWORD)
      subjectTemplate = 'Reset Password - Your Decot Account'
    else if (template === EmailTemplate.SIGN_DOCUMENT_SUCCESS)
      subjectTemplate = 'Contract successfully signed'
    else if (template === EmailTemplate.ACCOUNT_TO_NEW_EMPLOYEE)
      subjectTemplate = 'Invite Employee - Decot'
    else if (template === EmailTemplate.WELCOME_TO_CORPORATION)
      subjectTemplate = 'Welcome to Decot'
    else if (template === EmailTemplate.SEND_CONTRACT_TO_EMPLOYEE_BY_ROLE)
      subjectTemplate = 'Contract to be reviewed'
    else if (template === EmailTemplate.CONTRACT_APPROVAL_NOTIFICATION)
      subjectTemplate = 'Contract Approved'
    else if (template === EmailTemplate.PACKAGE_TO_SIGN)
      subjectTemplate = 'Contract Package to be signed - <%= packageName %>'
    else if (template === EmailTemplate.MODIFICATION_REQUEST)
      subjectTemplate = 'Modification Request - <%= documentTitle %>'
    else if (template === EmailTemplate.SECTION_SUGGESTION)
      subjectTemplate = 'Section Suggestion - <%= documentTitle %>'
    else throw new Error('CANNOT FIND SUBJECT')

    if (context) {
      try {
        return await ejs.render(subjectTemplate, context, { async: true })
      } catch (error: any) {
        return subjectTemplate
      }
    }

    return subjectTemplate
  }

  // ==================== PUBLIC METHODS ====================

  /**
   * Send verification email for registration
   */
  async sendVerificationEmail(
    to: string,
    code: string,
    codeExpiredTime: number = 24
  ): Promise<void> {
    const websiteLink = this.configService.get('CLIENT_API_HOST')
    const template = EmailTemplate.REGISTRATION_CONFIRMATION

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      code,
      codeExpiredTime: codeExpiredTime.toString(),
      websiteLink
    })
  }

  /**
   * Send verification code (resend OTP)
   */
  async sendVerificationCode(
    to: string,
    code: string,
    codeExpiredTime: number = 10
  ): Promise<void> {
    const emailSupport =
      this.configService.get('EMAIL_SUPPORT') || 'support@decot.io'
    const template = EmailTemplate.USER_LINK_EMAIL

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      code,
      codeExpiredTime: codeExpiredTime.toString(),
      emailSupport
    })
  }

  /**
   * Send reset password email
   */
  async sendResetPasswordEmail(
    to: string,
    code: string,
    codeExpiredTime: number = 24
  ): Promise<void> {
    const emailSupport =
      this.configService.get('EMAIL_SUPPORT') || 'support@decot.io'
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const template = EmailTemplate.PASSWORD_RESET

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      code,
      codeExpiredTime: codeExpiredTime.toString(),
      emailSupport,
      date: currentDate
    })
  }

  /**
   * Send link wallet OTP email
   */
  async sendLinkWalletOtpEmail(
    to: string,
    code: string,
    codeExpiredTime: number = 10
  ): Promise<void> {
    const emailSupport =
      this.configService.get('EMAIL_SUPPORT') || 'support@decot.io'
    const template = EmailTemplate.USER_LINK_WALLET

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      code,
      codeExpiredTime: codeExpiredTime.toString(),
      emailSupport
    })
  }

  /**
   * Send document to sign notification
   */
  async sendDocumentToSign(
    to: string,
    recipientName: string,
    documentTitle: string,
    senderName: string,
    documentLink: string
  ): Promise<void> {
    const template = EmailTemplate.DOCUMENT_TO_SIGN

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      name: recipientName,
      contractName: documentTitle,
      senderName,
      linkContract: documentLink,
      date: new Date().toUTCString(),
      isNewUser: 'false'
    })
  }

  /**
   * Send package to sign notification
   */
  async sendPackageToSign(
    to: string,
    recipientName: string,
    packageName: string,
    senderName: string,
    packageLink: string,
    documentCount: number
  ): Promise<void> {
    const template = EmailTemplate.PACKAGE_TO_SIGN

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      recipientName,
      packageName,
      senderName,
      packageLink,
      documentCount: documentCount.toString()
    })
  }

  /**
   * Send contract approval notification
   */
  async sendContractApprovalNotification(
    to: string,
    recipientName: string,
    contractTitle: string,
    approverName: string
  ): Promise<void> {
    const template = EmailTemplate.CONTRACT_APPROVAL_NOTIFICATION

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      recipientName,
      contractTitle,
      approverName
    })
  }

  /**
   * Send document signing rejection notification
   */
  async sendRejectSignDocument(
    to: string,
    recipientName: string,
    documentTitle: string,
    rejecterName: string,
    reason: string
  ): Promise<void> {
    const template = EmailTemplate.REJECT_SIGN_DOCUMENT

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      recipientName,
      documentTitle,
      rejecterName,
      reason
    })
  }

  /**
   * Send document signing success notification
   */
  async sendSignDocumentSuccess(
    to: string,
    recipientName: string,
    documentTitle: string,
    completionDate: string
  ): Promise<void> {
    const template = EmailTemplate.SIGN_DOCUMENT_SUCCESS

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      recipientName,
      documentTitle,
      completionDate
    })
  }

  /**
   * Send modification request notification
   */
  async sendModificationRequest(
    to: string,
    recipientName: string,
    documentTitle: string,
    requesterName: string,
    requestDetails: string
  ): Promise<void> {
    const template = EmailTemplate.MODIFICATION_REQUEST

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      recipientName,
      documentTitle,
      requesterName,
      requestDetails
    })
  }

  /**
   * Send section suggestion notification
   */
  async sendSectionSuggestion(
    to: string,
    recipientName: string,
    documentTitle: string,
    suggesterName: string,
    sectionName: string,
    suggestionText: string
  ): Promise<void> {
    const template = EmailTemplate.SECTION_SUGGESTION

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      recipientName,
      documentTitle,
      suggesterName,
      sectionName,
      suggestionText
    })
  }

  /**
   * Send vendor order email with custom HTML
   */
  async sendVendorOrderEmail(
    to: string,
    cc: string,
    subject: string,
    htmlBody: string
  ): Promise<void> {
    try {
      await this.emailProvider.sendEmail({
        from: this.defaultFrom,
        to,
        cc,
        subject,
        html: htmlBody
      })

      this.logger.log(`Vendor order email sent to ${to}`)
    } catch (error: any) {
      this.logger.error(
        `Error sending vendor order email: ${error.message}`,
        error.stack
      )
      throw new Error(`Failed to send vendor order email: ${error.message}`)
    }
  }

  /**
   * Send custom email with specified template
   */
  async sendCustomEmail(
    to: string,
    template: EmailTemplate,
    context: EmailTemplateContext,
    cc?: string
  ): Promise<void> {
    await this.sendEmailWithTemplate(to, template, context, cc)
  }

  /**
   * Send contract to employee by role (workflow notification)
   */
  async sendContractToEmployeeByRole(
    to: string,
    recipientName: string,
    contractName: string,
    senderName: string,
    contractLink: string,
    roleName: string
  ): Promise<void> {
    const template = EmailTemplate.SEND_CONTRACT_TO_EMPLOYEE_BY_ROLE

    await this.sendEmailWithTemplate(to, template, {
      email: to,
      recipientName,
      contractName,
      senderName,
      contractLink,
      roleName
    })
  }

  /**
   * Send welcome to corporation email
   */
  async sendWelcomeToCorporation(params: {
    toEmail: string
    toName: string
    corporationName: string
    groupName: string
    senderName: string
    isNewUser: boolean
  }): Promise<void> {
    const { toEmail, corporationName, groupName, senderName, isNewUser } =
      params

    const template = EmailTemplate.WELCOME_TO_CORPORATION
    const linkWebsite = this.configService.get('CLIENT_API_HOST')

    await this.sendEmailWithTemplate(toEmail, template, {
      emailNewEmployee: toEmail,
      corporationName: corporationName || '',
      groupName,
      senderName,
      isNewUser: isNewUser.toString(),
      linkWebsite
    })
  }

  /**
   * Send recipient contract notification (for existing users)
   */
  async sendRecipientContractNotification(params: {
    toEmail: string
    contractName: string
    date: string
    senderName: string
    linkContract: string
  }): Promise<void> {
    const { toEmail, contractName, date, senderName, linkContract } = params

    this.logger.log(`Sending contract notification to ${toEmail}`)

    await this.sendEmailWithTemplate(toEmail, EmailTemplate.DOCUMENT_TO_SIGN, {
      email: toEmail,
      name: toEmail.split('@')[0],
      contractName,
      senderName,
      linkContract,
      date,
      isNewUser: 'false'
    })
  }

  async sendCompleteContractNotification(params: {
    toEmail: string
    contractName: string
    date: string
    senderName: string
    linkContract: string
    signersInfo: string
  }): Promise<void> {
    const {
      toEmail,
      contractName,
      date,
      senderName,
      linkContract,
      signersInfo
    } = params

    this.logger.log(`Sending contract notification to ${toEmail}`)

    await this.sendEmailWithTemplate(
      toEmail,
      EmailTemplate.SIGN_DOCUMENT_SUCCESS,
      {
        email: toEmail,
        name: toEmail.split('@')[0],
        contractName,
        senderName,
        linkContract,
        link: linkContract,
        date,
        signersInfo,
        isNewUser: 'false'
      }
    )
  }

  /**
   * Send invite to new user (not yet registered)
   */
  async sendInviteRecipient(params: {
    toEmail: string
    contractName: string
    senderName: string
    linkInvite: string
  }): Promise<void> {
    const { toEmail, contractName, senderName, linkInvite } = params

    this.logger.log(`Sending invite to new user ${toEmail}`)

    await this.sendEmailWithTemplate(toEmail, EmailTemplate.DOCUMENT_TO_SIGN, {
      email: toEmail,
      name: toEmail.split('@')[0],
      contractName,
      senderName,
      linkContract: linkInvite,
      date: new Date().toUTCString(),
      isNewUser: 'true'
    })
  }

  /**
   * Legacy method - to be removed
   * @deprecated Use sendRecipientContractNotification or sendInviteRecipient instead
   */
  sendRecipientContract(userId: number, dto: any): any {
    this.logger.warn(
      'sendRecipientContract is deprecated, please use sendRecipientContractNotification or sendInviteRecipient'
    )
    this.logger.debug('sendRecipientContract called with dto:', dto)
  }
}
