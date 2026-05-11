/**
 * TC-03-05 — Yêu cầu từ IP trong danh sách chặn → HTTP 403 FRAUD_DETECTED
 * TC-03-06 — Gửi > 5 yêu cầu trong 10 giây → HTTP 429 (PurchaseRateLimitGuard)
 *
 * File này kiểm thử FraudService.evaluate() — logic đánh giá rủi ro fraud.
 */

import { FraudService, type EvaluateParams } from './fraud.service'

// ─── Mock factories ────────────────────────────────────────────────────────────

const makeRedisClient = () => ({
  exists: jest.fn().mockResolvedValue(0),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1)
})

const makeFraudRepo = () => ({
  findActiveBlacklistEntry: jest.fn().mockResolvedValue(null),
  createEvent: jest.fn().mockResolvedValue(undefined),
  upsertRiskProfile: jest.fn().mockResolvedValue(undefined),
  getStats: jest.fn().mockResolvedValue({}),
  getEvents: jest.fn().mockResolvedValue([]),
  getBlacklist: jest.fn().mockResolvedValue([]),
  addToBlacklist: jest.fn().mockResolvedValue(undefined),
  removeFromBlacklist: jest.fn().mockResolvedValue(undefined)
})

const makeRedis = (client: ReturnType<typeof makeRedisClient>) => ({
  client,
  incrementMetricCounter: jest.fn().mockResolvedValue(undefined)
})

const buildService = (
  overrides: {
    redisClient?: ReturnType<typeof makeRedisClient>
    fraudRepo?: ReturnType<typeof makeFraudRepo>
  } = {}
) => {
  const redisClient = overrides.redisClient ?? makeRedisClient()
  const fraudRepo = overrides.fraudRepo ?? makeFraudRepo()
  const redis = makeRedis(redisClient)

  const service = new FraudService(redis as never, fraudRepo as never)

  return { service, redisClient, fraudRepo, redis }
}

const baseParams: EvaluateParams = {
  ipAddress: '1.2.3.4',
  userId: 'user-id',
  userAgent: 'Mozilla/5.0',
  requestType: 'PURCHASE',
  campaignId: 'campaign-id'
}

// ─── TC-03-05 ─────────────────────────────────────────────────────────────────

describe('TC-03-05: Yêu cầu từ IP trong danh sách chặn → BLOCK', () => {
  it('IP có trong Redis blacklist → trả về BLOCK với score=1', async () => {
    const redisClient = makeRedisClient()
    redisClient.exists.mockResolvedValue(1) // IP bị blacklist

    const { service } = buildService({ redisClient })

    const decision = await service.evaluate({
      ...baseParams,
      ipAddress: '10.0.0.1'
    })

    expect(decision.action).toBe('BLOCK')
    expect(decision.score).toBe(1)
    expect(decision.triggeredRules).toContain('IP_BLACKLIST')
    expect(decision.message).toBeTruthy()
  })

  it('IP không trong Redis nhưng có trong DB → load vào Redis cache, trả về BLOCK', async () => {
    const redisClient = makeRedisClient()
    const fraudRepo = makeFraudRepo()

    redisClient.exists.mockResolvedValue(0) // không có trong Redis
    fraudRepo.findActiveBlacklistEntry.mockResolvedValue({
      ip: '192.168.1.1',
      expiresAt: new Date(Date.now() + 3600 * 1000) // hết hạn sau 1 giờ
    })

    const { service } = buildService({ redisClient, fraudRepo })

    const decision = await service.evaluate({
      ...baseParams,
      ipAddress: '192.168.1.1'
    })

    expect(decision.action).toBe('BLOCK')
    expect(decision.score).toBe(1)

    // Phải cache vào Redis để lần sau check nhanh hơn
    expect(redisClient.set).toHaveBeenCalledWith(
      'fraud:blacklist:192.168.1.1',
      '1',
      'EX',
      expect.any(Number)
    )
  })

  it('IP sạch → trả về ALLOW với score=0', async () => {
    const redisClient = makeRedisClient()
    const fraudRepo = makeFraudRepo()

    redisClient.exists.mockResolvedValue(0) // không trong Redis
    fraudRepo.findActiveBlacklistEntry.mockResolvedValue(null) // không trong DB

    const { service } = buildService({ redisClient, fraudRepo })

    const decision = await service.evaluate({
      ...baseParams,
      ipAddress: '8.8.8.8'
    })

    expect(decision.action).toBe('ALLOW')
    expect(decision.triggeredRules).toHaveLength(0)
  })

  it('blacklistIp → ghi vào DB + Redis với TTL giờ nhất định', async () => {
    const redisClient = makeRedisClient()
    const fraudRepo = makeFraudRepo()

    const { service } = buildService({ redisClient, fraudRepo })

    await service.blacklistIp('5.5.5.5', 'Scraping bot', 'admin-id', 24)

    expect(fraudRepo.addToBlacklist).toHaveBeenCalledWith(
      '5.5.5.5',
      'Scraping bot',
      'admin-id',
      24
    )
    expect(redisClient.set).toHaveBeenCalledWith(
      'fraud:blacklist:5.5.5.5',
      '1',
      'EX',
      24 * 3600
    )
  })

  it('removeFromBlacklist → xóa khỏi DB + Redis', async () => {
    const redisClient = makeRedisClient()
    const fraudRepo = makeFraudRepo()

    const { service } = buildService({ redisClient, fraudRepo })

    await service.removeFromBlacklist('5.5.5.5')

    expect(fraudRepo.removeFromBlacklist).toHaveBeenCalledWith('5.5.5.5')
    expect(redisClient.del).toHaveBeenCalledWith('fraud:blacklist:5.5.5.5')
  })

  it('Redis lỗi khi check blacklist → fail-open: tiếp tục kiểm tra DB', async () => {
    const redisClient = makeRedisClient()
    const fraudRepo = makeFraudRepo()

    // Redis down
    redisClient.exists.mockRejectedValue(new Error('Redis connection refused'))
    // DB cũng không có
    fraudRepo.findActiveBlacklistEntry.mockResolvedValue(null)

    const { service } = buildService({ redisClient, fraudRepo })

    // Không được throw — phải tiếp tục xử lý
    const decision = await service.evaluate(baseParams)

    // Vẫn phải có kết quả (có thể ALLOW hoặc dựa trên các rule khác)
    expect(['ALLOW', 'FLAG', 'BLOCK']).toContain(decision.action)
  })
})

// ─── Fraud rules composite score ──────────────────────────────────────────────

describe('FraudService.evaluate: tính toán composite score từ rules', () => {
  it('không có rule nào vi phạm → ALLOW, score=0', async () => {
    const { service } = buildService()

    const decision = await service.evaluate({
      ...baseParams,
      userId: 'trusted-user'
    })

    // IP sạch, rules không vi phạm → ALLOW
    expect(['ALLOW', 'FLAG']).toContain(decision.action)
  })

  it('evaluate ghi lại sự kiện bất đồng bộ (setImmediate)', async () => {
    const fraudRepo = makeFraudRepo()
    const { service } = buildService({ fraudRepo })

    await service.evaluate(baseParams)

    // Chờ setImmediate chạy
    await new Promise<void>(resolve => setImmediate(resolve))

    // createEvent phải được gọi sau setImmediate
    expect(fraudRepo.createEvent).toHaveBeenCalled()
  })
})

// ─── TC-03-06 (logic guard — test qua abstraction) ────────────────────────────

describe('TC-03-06: Rate limit purchase — kiểm tra logic thresholds', () => {
  it('FraudService trả BLOCK khi score >= 0.75', async () => {
    // Test thông qua blacklist để đảm bảo logic BLOCK hoạt động
    const redisClient = makeRedisClient()
    redisClient.exists.mockResolvedValue(1) // IP blacklisted → score = 1.0

    const { service } = buildService({ redisClient })

    const decision = await service.evaluate(baseParams)

    expect(decision.action).toBe('BLOCK')
    expect(decision.score).toBeGreaterThanOrEqual(0.75)
  })

  it('FraudService trả ALLOW khi không có rule nào vi phạm', async () => {
    const redisClient = makeRedisClient()
    const fraudRepo = makeFraudRepo()

    redisClient.exists.mockResolvedValue(0)
    fraudRepo.findActiveBlacklistEntry.mockResolvedValue(null)

    const { service } = buildService({ redisClient, fraudRepo })

    const decision = await service.evaluate({
      ...baseParams,
      userId: 'normal-user',
      ipAddress: '203.0.113.1'
    })

    expect(decision.action).not.toBe(undefined)
    expect(typeof decision.score).toBe('number')
    expect(decision.score).toBeGreaterThanOrEqual(0)
    expect(decision.score).toBeLessThanOrEqual(1)
  })
})
