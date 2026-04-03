import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CampaignStatus,
  KycStatus,
  NotificationType,
  UserRole
} from '@prisma/client'
import * as amqplib from 'amqplib'
import * as crypto from 'crypto'
import { RedisService } from '@infrastructure/redis/redis.service'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import {
  FAILED_QUEUE_NAMES,
  QUEUE_NAMES,
  RETRY_HEADER
} from '@infrastructure/rabbitmq/rabbitmq.constants'
import { NotificationRepository } from '../repositories/notification.repository'

const LINK_TOKEN_TTL_SECONDS = 10 * 60
const LINK_TOKEN_KEY_PREFIX = 'telegram:link-token:'
const ACTION_TOKEN_TTL_SECONDS = 5 * 60
const ACTION_TOKEN_KEY_PREFIX = 'telegram:action-token:'
const RESOURCE_LOCK_KEY_PREFIX = 'telegram:resource-lock:'
const ACTION_CALLBACK_PREFIX = 'act:'
const TELEGRAM_REJECT_REASON = 'Từ chối bởi quản trị viên qua Telegram'

export type TelegramActionType =
  | 'APPROVE_MERCHANT'
  | 'REJECT_MERCHANT'
  | 'APPROVE_CAMPAIGN'
  | 'REJECT_CAMPAIGN'

export interface TelegramActionDescriptor {
  type: TelegramActionType
  resourceId: string
  label?: string
}

interface TelegramActionTokenPayload {
  userId: string
  actionType: TelegramActionType
  resourceId: string
}

interface TelegramInlineKeyboardButton {
  text: string
  callback_data: string
}

interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

export interface TelegramWebhookUpdate {
  message?: {
    text?: string
    chat?: { id: number | string }
    from?: {
      id: number | string
      username?: string
      first_name?: string
      last_name?: string
    }
  }
  callback_query?: {
    id: string
    data?: string
    from?: {
      id: number | string
      username?: string
    }
    message?: {
      message_id?: number | string
      chat?: {
        id: number | string
      }
    }
  }
}

interface TelegramApiResponse {
  ok: boolean
  description?: string
  result?:
    | {
        message_id?: number | string
      }
    | boolean
}

export interface TelegramNotificationJobPayload {
  deliveryId: string
  notificationId: string
  userId: string
  type: NotificationType
  title: string
  message: string
  telegramActions?: TelegramActionDescriptor[]
}

/** Lỗi cố định từ Telegram — không nên retry (bot bị block, chat không tồn tại) */
class TelegramPermanentError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number
  ) {
    super(message)
    this.name = 'TelegramPermanentError'
  }
}

const TELEGRAM_API_TIMEOUT_MS = 10_000

@Injectable()
export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService,
    private readonly notificationRepository: NotificationRepository
  ) {}

  private get botToken(): string {
    const token = this.configService.get<string>('telegram.BOT_TOKEN')
    if (!token) {
      throw new ServiceUnavailableException(
        'Telegram bot token chưa được cấu hình'
      )
    }
    return token
  }

  private get botUsername(): string {
    const username = this.configService.get<string>('telegram.BOT_USERNAME')
    if (!username) {
      throw new ServiceUnavailableException(
        'Telegram bot username chưa được cấu hình'
      )
    }
    return username.replace('@', '')
  }

  private get webhookSecret(): string {
    const secret = this.configService.get<string>('telegram.WEBHOOK_SECRET')
    if (!secret) {
      throw new ServiceUnavailableException(
        'Telegram webhook secret chưa được cấu hình'
      )
    }
    return secret
  }

  private get allowLegacyPathSecretAuth(): boolean {
    const value = this.configService.get<string | boolean>(
      'telegram.ALLOW_LEGACY_PATH_SECRET_AUTH'
    )

    if (typeof value === 'boolean') {
      return value
    }

    if (typeof value === 'string') {
      return value.toLowerCase() === 'true'
    }

    return false
  }

  async createLinkToken(userId: string): Promise<{
    botUsername: string
    deepLink: string
    expiresInSeconds: number
  }> {
    const token = crypto.randomBytes(24).toString('hex')
    const cacheKey = `${LINK_TOKEN_KEY_PREFIX}${token}`

    await this.redis.client.set(cacheKey, userId, 'EX', LINK_TOKEN_TTL_SECONDS)

    return {
      botUsername: this.botUsername,
      deepLink: `https://t.me/${this.botUsername}?start=${token}`,
      expiresInSeconds: LINK_TOKEN_TTL_SECONDS
    }
  }

  async getLinkStatus(userId: string): Promise<{
    linked: boolean
    telegramUsername?: string | null
    telegramFirstName?: string | null
    linkedAt?: Date | null
  }> {
    const link =
      await this.notificationRepository.findActiveTelegramLinkByUserId(userId)

    if (!link) {
      return {
        linked: false,
        telegramUsername: null,
        telegramFirstName: null,
        linkedAt: null
      }
    }

    return {
      linked: true,
      telegramUsername: link.telegramUsername,
      telegramFirstName: link.telegramFirstName,
      linkedAt: link.linkedAt
    }
  }

  async unlink(userId: string): Promise<{ revoked: boolean }> {
    return this.notificationRepository.revokeTelegramLink(userId)
  }

  async handleWebhook(
    secretToken: string | undefined,
    update: TelegramWebhookUpdate,
    legacyPathSecret?: string
  ): Promise<{
    ok: boolean
  }> {
    if (!this.isWebhookAuthorized(secretToken, legacyPathSecret)) {
      throw new UnauthorizedException('Unauthorized webhook request')
    }

    const callbackQuery = update.callback_query
    if (callbackQuery) {
      await this.handleCallbackQuery(callbackQuery)
      return { ok: true }
    }

    const text = update.message?.text?.trim() ?? ''
    if (!text.startsWith('/start')) {
      return { ok: true }
    }

    const chatId = String(update.message?.chat?.id ?? '')
    const telegramUserId = String(update.message?.from?.id ?? '')

    if (!chatId || !telegramUserId) {
      return { ok: true }
    }

    const token = text.split(' ')[1]?.trim() ?? ''
    if (!token) {
      await this.sendMessage(
        chatId,
        'Link liên kết không hợp lệ. Vui lòng lấy lại từ trang Cài đặt.'
      )
      return { ok: true }
    }

    const userId = await this.consumeLinkToken(token)
    if (!userId) {
      await this.sendMessage(
        chatId,
        'Link liên kết đã hết hạn hoặc đã được sử dụng. Vui lòng tạo link mới trong trang Cài đặt.'
      )
      return { ok: true }
    }

    const existingByChat =
      await this.notificationRepository.findActiveTelegramLinkByChatId(chatId)

    if (existingByChat && existingByChat.userId !== userId) {
      await this.sendMessage(
        chatId,
        'Chat này đã được liên kết với tài khoản khác. Vui lòng unlink trước khi liên kết tài khoản mới.'
      )
      return { ok: true }
    }

    await this.notificationRepository.upsertTelegramLink({
      userId,
      telegramChatId: chatId,
      telegramUserId,
      telegramUsername: update.message?.from?.username,
      telegramFirstName: update.message?.from?.first_name,
      telegramLastName: update.message?.from?.last_name,
      lastInteractionAt: new Date()
    })

    await this.notificationRepository.updatePreferences(userId, {
      telegramEnabled: true
    })

    await this.sendMessage(
      chatId,
      'Liên kết Telegram thành công. Bạn sẽ nhận thông báo cá nhân từ Flash Sale tại chat này.'
    )

    return { ok: true }
  }

  private isWebhookAuthorized(
    secretToken: string | undefined,
    legacyPathSecret?: string
  ): boolean {
    const expectedSecret = this.webhookSecret
    const normalizedSecretToken = secretToken?.trim()

    // If header is provided but invalid, reject immediately.
    if (typeof secretToken === 'string') {
      return this.isSecretEqual(normalizedSecretToken, expectedSecret)
    }

    if (
      this.allowLegacyPathSecretAuth &&
      this.isSecretEqual(legacyPathSecret?.trim(), expectedSecret)
    ) {
      this.logger.warn(
        'Using deprecated Telegram webhook auth via URL path secret. Please migrate to X-Telegram-Bot-Api-Secret-Token header.'
      )
      return true
    }

    return false
  }

  private isSecretEqual(
    receivedSecret: string | undefined,
    expectedSecret: string
  ): boolean {
    if (!receivedSecret) {
      return false
    }

    const receivedBuffer = Buffer.from(receivedSecret)
    const expectedBuffer = Buffer.from(expectedSecret)

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false
    }

    return crypto.timingSafeEqual(
      new Uint8Array(receivedBuffer),
      new Uint8Array(expectedBuffer)
    )
  }

  async enqueueTelegramNotification(
    payload: Omit<TelegramNotificationJobPayload, 'deliveryId'>
  ): Promise<void> {
    const idempotencyKey = `notification:${payload.notificationId}`

    try {
      const delivery = await this.notificationRepository.createTelegramDelivery(
        {
          userId: payload.userId,
          notificationId: payload.notificationId,
          eventType: payload.type,
          idempotencyKey
        }
      )

      const published = await this.rabbitmq.publish(QUEUE_NAMES.TELEGRAM, {
        ...payload,
        deliveryId: delivery.id
      })

      if (!published) {
        await this.notificationRepository.markTelegramDeliveryFailed(
          delivery.id,
          {
            errorCode: 'QUEUE_UNAVAILABLE',
            errorMessage: 'Không thể enqueue telegram notification',
            attemptCount: 0
          }
        )
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('Unique constraint')) {
        this.logger.error(`Cannot enqueue telegram notification: ${message}`)
      }
    }
  }

  async startTelegramConsumer(): Promise<void> {
    await this.rabbitmq.consume(
      QUEUE_NAMES.TELEGRAM,
      msg => this.processTelegramMessage(msg),
      {
        prefetch: 10,
        maxRetries: 5,
        retryDelayMs: 2_000,
        failedQueue: FAILED_QUEUE_NAMES.TELEGRAM
      }
    )
  }

  private async processTelegramMessage(
    msg: amqplib.ConsumeMessage
  ): Promise<void> {
    const payload = JSON.parse(
      msg.content.toString()
    ) as TelegramNotificationJobPayload

    const attemptCount = Number(msg.properties.headers?.[RETRY_HEADER] ?? 0) + 1

    try {
      const link =
        await this.notificationRepository.findActiveTelegramLinkByUserId(
          payload.userId
        )
      if (!link) {
        await this.notificationRepository.markTelegramDeliveryFailed(
          payload.deliveryId,
          {
            errorCode: 'TELEGRAM_LINK_NOT_FOUND',
            errorMessage: 'User chưa liên kết Telegram',
            attemptCount
          }
        )
        return
      }

      const messageText = this.composeMessage(payload)
      const inlineKeyboard = await this.buildInlineKeyboard(
        payload.userId,
        payload.telegramActions
      )
      const sent = await this.sendMessage(
        link.telegramChatId,
        messageText,
        inlineKeyboard
      )

      await this.notificationRepository.markTelegramDeliverySent(
        payload.deliveryId,
        String(sent.messageId),
        attemptCount
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const isPermanent = error instanceof TelegramPermanentError

      await this.notificationRepository.markTelegramDeliveryFailed(
        payload.deliveryId,
        {
          errorCode: isPermanent
            ? 'TELEGRAM_PERMANENT_ERROR'
            : 'TELEGRAM_SEND_FAILED',
          errorMessage: message,
          attemptCount
        }
      )

      if (isPermanent) {
        // 403 = bot bị block → tự động revoke link, không làm phiền user nữa
        if (error.httpStatus === 403) {
          await this.notificationRepository.revokeTelegramLink(payload.userId)
          this.logger.warn(
            `Auto-revoked Telegram link for userId=${payload.userId}: bot was blocked by user`
          )
        }
        // Không rethrow → RabbitMQ ack, không retry
        return
      }

      throw error
    }
  }

  private composeMessage(payload: TelegramNotificationJobPayload): string {
    return [`Flash Sale`, '', payload.title, payload.message].join('\n')
  }

  private async buildInlineKeyboard(
    userId: string,
    actions?: TelegramActionDescriptor[]
  ): Promise<TelegramInlineKeyboardMarkup | undefined> {
    if (!actions?.length) {
      return undefined
    }

    const buttons: TelegramInlineKeyboardButton[][] = []

    for (const action of actions) {
      const token = await this.createActionToken({
        userId,
        actionType: action.type,
        resourceId: action.resourceId
      })

      buttons.push([
        {
          text: action.label ?? this.getActionLabel(action.type),
          callback_data: `${ACTION_CALLBACK_PREFIX}${token}`
        }
      ])
    }

    return {
      inline_keyboard: buttons
    }
  }

  private getActionLabel(actionType: TelegramActionType): string {
    switch (actionType) {
      case 'APPROVE_MERCHANT':
        return 'Duyệt nhà bán hàng'
      case 'REJECT_MERCHANT':
        return 'Từ chối nhà bán hàng'
      case 'APPROVE_CAMPAIGN':
        return 'Duyệt chiến dịch'
      case 'REJECT_CAMPAIGN':
        return 'Từ chối chiến dịch'
      default:
        return 'Xử lý'
    }
  }

  private async handleCallbackQuery(update: {
    id: string
    data?: string
    from?: {
      id: number | string
      username?: string
    }
    message?: {
      message_id?: number | string
      chat?: {
        id: number | string
      }
    }
  }): Promise<void> {
    const callbackId = update.id
    const callbackData = update.data ?? ''
    const chatId = String(update.message?.chat?.id ?? '')
    const telegramUserId = String(update.from?.id ?? '')

    if (!callbackId || !chatId || !telegramUserId) {
      return
    }

    const token = this.extractActionToken(callbackData)
    if (!token) {
      await this.answerCallbackQuery(callbackId, 'Hành động không hợp lệ')
      return
    }

    const action = await this.getActionToken(token)
    if (!action) {
      await this.answerCallbackQuery(
        callbackId,
        'Tác vụ đã hết hạn hoặc đã được xử lý'
      )
      return
    }

    const link =
      await this.notificationRepository.findActiveTelegramLinkByChatId(chatId)
    if (!link || link.telegramUserId !== telegramUserId) {
      await this.answerCallbackQuery(
        callbackId,
        'Chat Telegram chưa được liên kết hợp lệ'
      )
      return
    }

    if (link.userId !== action.userId) {
      await this.answerCallbackQuery(
        callbackId,
        'Bạn không có quyền thực hiện hành động này'
      )
      return
    }

    const role = await this.notificationRepository.findUserRoleById(link.userId)
    if (role !== UserRole.ADMIN) {
      await this.answerCallbackQuery(
        callbackId,
        'Tài khoản không đủ quyền ADMIN'
      )
      return
    }

    const resourceLockKey = this.getResourceLockKey(action)
    const lockValue = await this.acquireResourceLock(resourceLockKey)
    if (!lockValue) {
      await this.answerCallbackQuery(
        callbackId,
        'Tác vụ đang được xử lý, vui lòng đợi'
      )
      return
    }

    try {
      // Consume token atomically TRƯỚC khi execute — tránh double execution
      // nếu action thành công nhưng consume gặp lỗi tạm thời.
      const consumed = await this.consumeActionToken(token)
      if (!consumed) {
        await this.answerCallbackQuery(
          callbackId,
          'Tác vụ đã được xử lý trước đó'
        )
        return
      }

      const resultMessage = await this.executeAdminAction(action)
      await this.answerCallbackQuery(callbackId, 'Đã xử lý thành công')
      await this.sendMessage(chatId, resultMessage)

      const messageId = update.message?.message_id
      if (messageId) {
        await this.clearInlineKeyboard(chatId, String(messageId))
      }
    } catch (error: unknown) {
      this.logger.error(
        `Telegram admin action failed: token=${token}, action=${
          action.actionType
        }, resourceId=${action.resourceId}, error=${
          error instanceof Error ? error.message : String(error)
        }`
      )
      await this.answerCallbackQuery(
        callbackId,
        'Không thể xử lý tác vụ. Vui lòng thực hiện qua trang web.'
      )
    } finally {
      await this.releaseResourceLock(resourceLockKey, lockValue)
    }
  }

  private getResourceLockKey(action: TelegramActionTokenPayload): string {
    const resourceType =
      action.actionType === 'APPROVE_MERCHANT' ||
      action.actionType === 'REJECT_MERCHANT'
        ? 'merchant'
        : 'campaign'

    return `${RESOURCE_LOCK_KEY_PREFIX}${resourceType}:${action.resourceId}`
  }

  private async executeAdminAction(
    action: TelegramActionTokenPayload
  ): Promise<string> {
    switch (action.actionType) {
      case 'APPROVE_MERCHANT':
        return this.approveMerchantAction(action.resourceId)
      case 'REJECT_MERCHANT':
        return this.rejectMerchantAction(action.resourceId)
      case 'APPROVE_CAMPAIGN':
        return this.approveCampaignAction(action.resourceId)
      case 'REJECT_CAMPAIGN':
        return this.rejectCampaignAction(action.resourceId)
      default:
        throw new BadRequestException(
          'Loại hành động Telegram không được hỗ trợ'
        )
    }
  }

  private async approveMerchantAction(merchantId: string): Promise<string> {
    const merchant =
      await this.notificationRepository.findMerchantForAdminAction(merchantId)

    if (!merchant) {
      return 'Không tìm thấy hồ sơ nhà bán hàng để duyệt.'
    }

    if (merchant.kycStatus !== KycStatus.PENDING) {
      return `Hồ sơ ${merchant.businessName} hiện đang ở trạng thái ${merchant.kycStatus}, không thể duyệt qua Telegram.`
    }

    const approved =
      await this.notificationRepository.approveMerchantFromAdminAction(
        merchant.id,
        merchant.userId
      )

    if (!approved) {
      return `Hồ sơ ${merchant.businessName} đã được cập nhật bởi tác vụ khác.`
    }

    return `Đã duyệt nhà bán hàng ${merchant.businessName} thành công.`
  }

  private async rejectMerchantAction(merchantId: string): Promise<string> {
    const merchant =
      await this.notificationRepository.findMerchantForAdminAction(merchantId)

    if (!merchant) {
      return 'Không tìm thấy hồ sơ nhà bán hàng để từ chối.'
    }

    if (merchant.kycStatus !== KycStatus.PENDING) {
      return `Hồ sơ ${merchant.businessName} hiện đang ở trạng thái ${merchant.kycStatus}, không thể từ chối qua Telegram.`
    }

    const rejected =
      await this.notificationRepository.rejectMerchantFromAdminAction(
        merchant.id,
        TELEGRAM_REJECT_REASON
      )

    if (!rejected) {
      return `Hồ sơ ${merchant.businessName} đã được cập nhật bởi tác vụ khác.`
    }

    return `Đã từ chối nhà bán hàng ${merchant.businessName}.`
  }

  private async approveCampaignAction(campaignId: string): Promise<string> {
    const campaign =
      await this.notificationRepository.findCampaignForAdminAction(campaignId)

    if (!campaign || campaign.deletedAt) {
      return 'Không tìm thấy chiến dịch để duyệt.'
    }

    if (campaign.status !== CampaignStatus.APPROVED) {
      return `Chiến dịch ${campaign.name} đang ở trạng thái ${campaign.status}, không thể duyệt qua Telegram.`
    }

    const approved =
      await this.notificationRepository.updateCampaignStatusFromAdminAction(
        campaign.id,
        CampaignStatus.APPROVED,
        CampaignStatus.SCHEDULED
      )

    if (!approved) {
      return `Chiến dịch ${campaign.name} đã được cập nhật bởi tác vụ khác.`
    }

    return `Đã duyệt chiến dịch ${campaign.name}, trạng thái mới: SCHEDULED.`
  }

  private async rejectCampaignAction(campaignId: string): Promise<string> {
    const campaign =
      await this.notificationRepository.findCampaignForAdminAction(campaignId)

    if (!campaign || campaign.deletedAt) {
      return 'Không tìm thấy chiến dịch để từ chối.'
    }

    if (campaign.status !== CampaignStatus.APPROVED) {
      return `Chiến dịch ${campaign.name} đang ở trạng thái ${campaign.status}, không thể từ chối qua Telegram.`
    }

    const rejected =
      await this.notificationRepository.updateCampaignStatusFromAdminAction(
        campaign.id,
        CampaignStatus.APPROVED,
        CampaignStatus.DRAFT
      )

    if (!rejected) {
      return `Chiến dịch ${campaign.name} đã được cập nhật bởi tác vụ khác.`
    }

    return `Đã từ chối chiến dịch ${campaign.name}, chiến dịch đã quay về DRAFT.`
  }

  private async sendMessage(
    chatId: string,
    text: string,
    replyMarkup?: TelegramInlineKeyboardMarkup
  ): Promise<{ messageId: string | number }> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          reply_markup: replyMarkup
        }),
        signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS)
      }
    )

    if (!response.ok) {
      // 403 = bot bị user block, 400 = chat không tồn tại — không retry
      if (response.status === 403 || response.status === 400) {
        throw new TelegramPermanentError(
          `Telegram API permanent error: ${response.status}`,
          response.status
        )
      }
      throw new Error(`Telegram API HTTP error: ${response.status}`)
    }

    const data = (await response.json()) as TelegramApiResponse
    const messageId =
      typeof data.result === 'object' && data.result !== null
        ? data.result.message_id
        : undefined

    if (!data.ok || !messageId) {
      throw new Error(
        data.description ?? 'Telegram API trả về lỗi không xác định'
      )
    }

    return { messageId }
  }

  private async answerCallbackQuery(
    callbackQueryId: string,
    text: string
  ): Promise<void> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: false
        }),
        signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS)
      }
    )

    if (!response.ok) {
      this.logger.warn(
        `Cannot answer callback query id=${callbackQueryId}, http=${response.status}`
      )
      return
    }

    const data = (await response.json()) as TelegramApiResponse
    if (!data.ok) {
      this.logger.warn(
        `Telegram answerCallbackQuery failed id=${callbackQueryId}: ${
          data.description ?? 'unknown error'
        }`
      )
    }
  }

  private async clearInlineKeyboard(
    chatId: string,
    messageId: string
  ): Promise<void> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/editMessageReplyMarkup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: Number(messageId),
          reply_markup: { inline_keyboard: [] }
        }),
        signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS)
      }
    )

    if (!response.ok) {
      this.logger.warn(
        `Cannot clear inline keyboard chatId=${chatId}, messageId=${messageId}, http=${response.status}`
      )
      return
    }

    const data = (await response.json()) as TelegramApiResponse
    if (!data.ok) {
      this.logger.warn(
        `Telegram editMessageReplyMarkup failed chatId=${chatId}, messageId=${messageId}: ${
          data.description ?? 'unknown error'
        }`
      )
    }
  }

  private extractActionToken(callbackData: string): string | null {
    if (!callbackData.startsWith(ACTION_CALLBACK_PREFIX)) {
      return null
    }

    const token = callbackData.slice(ACTION_CALLBACK_PREFIX.length).trim()
    return token || null
  }

  private async createActionToken(
    payload: TelegramActionTokenPayload
  ): Promise<string> {
    const token = crypto.randomBytes(16).toString('hex')
    const key = `${ACTION_TOKEN_KEY_PREFIX}${token}`

    await this.redis.client.set(
      key,
      JSON.stringify(payload),
      'EX',
      ACTION_TOKEN_TTL_SECONDS
    )

    return token
  }

  private async getActionToken(
    token: string
  ): Promise<TelegramActionTokenPayload | null> {
    const key = `${ACTION_TOKEN_KEY_PREFIX}${token}`
    const result = await this.redis.client.get(key)

    if (!result) {
      return null
    }

    try {
      const parsed = JSON.parse(result) as TelegramActionTokenPayload
      if (!parsed.userId || !parsed.actionType || !parsed.resourceId) {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  private async consumeActionToken(token: string): Promise<boolean> {
    const key = `${ACTION_TOKEN_KEY_PREFIX}${token}`
    const result = await this.consumeRedisToken(key)

    return Boolean(result)
  }

  private async acquireResourceLock(lockKey: string): Promise<string | null> {
    const lockValue = crypto.randomBytes(12).toString('hex')
    const result = await this.redis.client.set(
      lockKey,
      lockValue,
      'EX',
      30,
      'NX'
    )

    return result === 'OK' ? lockValue : null
  }

  private async releaseResourceLock(
    lockKey: string,
    lockValue: string
  ): Promise<void> {
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `

    await this.redis.client.eval(script, 1, lockKey, lockValue)
  }

  private async consumeLinkToken(token: string): Promise<string | null> {
    const key = `${LINK_TOKEN_KEY_PREFIX}${token}`

    return this.consumeRedisToken(key)
  }

  private async consumeRedisToken(key: string): Promise<string | null> {
    const script = `
      local value = redis.call('GET', KEYS[1])
      if value then
        redis.call('DEL', KEYS[1])
      end
      return value
    `

    const result = await this.redis.client.eval(script, 1, key)
    if (!result) return null
    return String(result)
  }
}
