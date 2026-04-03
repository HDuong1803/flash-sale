import { ConfigService } from '@nestjs/config'
import { KycStatus, UserRole } from '@prisma/client'
import { NotificationRepository } from '../repositories/notification.repository'
import { TelegramNotificationService } from './telegram-notification.service'

describe('TelegramNotificationService', () => {
  const webhookSecretToken = 'secret-123'
  let allowLegacyPathSecretAuth = true

  let service: TelegramNotificationService
  let configService: Pick<ConfigService, 'get'>
  let redisClient: {
    get: jest.Mock
    set: jest.Mock
    eval: jest.Mock
    del: jest.Mock
  }
  let redisService: { client: typeof redisClient }
  let rabbitmqService: { publish: jest.Mock; consume: jest.Mock }
  let notificationRepository: Partial<NotificationRepository>

  beforeEach(() => {
    allowLegacyPathSecretAuth = true

    redisClient = {
      get: jest.fn(),
      set: jest.fn(),
      eval: jest.fn(),
      del: jest.fn()
    }

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'telegram.BOT_TOKEN') return 'bot-token'
        if (key === 'telegram.BOT_USERNAME') return 'flashsale_bot'
        if (key === 'telegram.WEBHOOK_SECRET') return webhookSecretToken
        if (key === 'telegram.ALLOW_LEGACY_PATH_SECRET_AUTH') {
          return allowLegacyPathSecretAuth
        }
        return undefined
      })
    }

    redisService = { client: redisClient }
    rabbitmqService = { publish: jest.fn(), consume: jest.fn() }

    notificationRepository = {
      findActiveTelegramLinkByChatId: jest.fn(),
      findUserRoleById: jest.fn(),
      findMerchantForAdminAction: jest.fn(),
      approveMerchantFromAdminAction: jest.fn()
    }

    service = new TelegramNotificationService(
      configService as ConfigService,
      redisService as any,
      rabbitmqService as any,
      notificationRepository as NotificationRepository
    )

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1001 } })
    } as never)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('executes approve merchant callback for linked admin user', async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        userId: 'admin-1',
        actionType: 'APPROVE_MERCHANT',
        resourceId: 'merchant-1'
      })
    )
    redisClient.set.mockResolvedValue('OK')
    redisClient.eval.mockResolvedValue('1')
    ;(
      notificationRepository.findActiveTelegramLinkByChatId as jest.Mock
    ).mockResolvedValue({
      userId: 'admin-1',
      telegramUserId: 'tg-admin-1'
    })
    ;(notificationRepository.findUserRoleById as jest.Mock).mockResolvedValue(
      UserRole.ADMIN
    )
    ;(
      notificationRepository.findMerchantForAdminAction as jest.Mock
    ).mockResolvedValue({
      id: 'merchant-1',
      userId: 'merchant-user-1',
      businessName: 'Merchant Demo',
      kycStatus: KycStatus.PENDING
    })
    ;(
      notificationRepository.approveMerchantFromAdminAction as jest.Mock
    ).mockResolvedValue(true)

    await service.handleWebhook(webhookSecretToken, {
      callback_query: {
        id: 'callback-1',
        data: 'act:test-token',
        from: { id: 'tg-admin-1' },
        message: { message_id: '55', chat: { id: 'chat-1' } }
      }
    })

    expect(
      notificationRepository.approveMerchantFromAdminAction
    ).toHaveBeenCalledWith('merchant-1', 'merchant-user-1')
    expect(redisClient.eval).toHaveBeenCalledTimes(2)
  })

  it('does not consume token when callback user does not match linked telegram user', async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        userId: 'admin-1',
        actionType: 'APPROVE_MERCHANT',
        resourceId: 'merchant-1'
      })
    )
    ;(
      notificationRepository.findActiveTelegramLinkByChatId as jest.Mock
    ).mockResolvedValue({
      userId: 'admin-1',
      telegramUserId: 'tg-other'
    })

    await service.handleWebhook(webhookSecretToken, {
      callback_query: {
        id: 'callback-2',
        data: 'act:test-token',
        from: { id: 'tg-admin-1' },
        message: { message_id: '56', chat: { id: 'chat-1' } }
      }
    })

    expect(redisClient.eval).not.toHaveBeenCalled()
    expect(
      notificationRepository.approveMerchantFromAdminAction
    ).not.toHaveBeenCalled()
  })

  it('skips callback when action token is missing or expired', async () => {
    redisClient.get.mockResolvedValue(null)

    await service.handleWebhook(webhookSecretToken, {
      callback_query: {
        id: 'callback-3',
        data: 'act:test-token',
        from: { id: 'tg-admin-1' },
        message: { message_id: '57', chat: { id: 'chat-1' } }
      }
    })

    expect(redisClient.eval).not.toHaveBeenCalled()
    expect(
      notificationRepository.findActiveTelegramLinkByChatId
    ).not.toHaveBeenCalled()
  })

  it('does not execute action when resource lock is already held', async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        userId: 'admin-1',
        actionType: 'APPROVE_MERCHANT',
        resourceId: 'merchant-1'
      })
    )
    redisClient.set.mockResolvedValue(null)
    ;(
      notificationRepository.findActiveTelegramLinkByChatId as jest.Mock
    ).mockResolvedValue({
      userId: 'admin-1',
      telegramUserId: 'tg-admin-1'
    })
    ;(notificationRepository.findUserRoleById as jest.Mock).mockResolvedValue(
      UserRole.ADMIN
    )

    await service.handleWebhook(webhookSecretToken, {
      callback_query: {
        id: 'callback-4',
        data: 'act:test-token',
        from: { id: 'tg-admin-1' },
        message: { message_id: '58', chat: { id: 'chat-1' } }
      }
    })

    expect(redisClient.eval).not.toHaveBeenCalled()
    expect(
      notificationRepository.approveMerchantFromAdminAction
    ).not.toHaveBeenCalled()
  })

  it('accepts legacy path secret when header token is missing', async () => {
    await expect(
      service.handleWebhook(
        undefined,
        { message: { text: 'ping' } },
        webhookSecretToken
      )
    ).resolves.toEqual({ ok: true })
  })

  it('rejects webhook when both header token and legacy path secret are invalid', async () => {
    await expect(
      service.handleWebhook(
        'wrong-token',
        { message: { text: 'ping' } },
        'wrong-path-secret'
      )
    ).rejects.toThrow('Unauthorized webhook request')
  })

  it('rejects when header token is invalid even if legacy path secret is valid', async () => {
    await expect(
      service.handleWebhook(
        'wrong-token',
        { message: { text: 'ping' } },
        webhookSecretToken
      )
    ).rejects.toThrow('Unauthorized webhook request')
  })

  it('rejects valid legacy path secret when legacy toggle is disabled', async () => {
    allowLegacyPathSecretAuth = false

    await expect(
      service.handleWebhook(
        undefined,
        { message: { text: 'ping' } },
        webhookSecretToken
      )
    ).rejects.toThrow('Unauthorized webhook request')
  })
})
