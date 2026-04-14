import { Logger } from '@common/logger'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createId } from '@paralleldrive/cuid2'
import Redis from 'ioredis'

@Injectable()
export class RedisService {
  private _redisClient: Redis
  private redisHost: string
  private redisPort: number
  private redisUsername: string
  private redisPassword: string
  private readonly logger = new Logger(RedisService.name)

  constructor(private readonly configService: ConfigService) {
    this.redisHost = this.configService.get<string>(
      'redis.REDIS_HOST',
      'localhost'
    )
    this.redisPort = this.configService.get<number>('redis.REDIS_PORT', 6379)
    this.redisUsername = this.configService.get<string>(
      'redis.REDIS_USERNAME',
      'default'
    )
    this.redisPassword = this.configService.get<string>(
      'redis.REDIS_PASSWORD',
      'pass'
    )

    this._redisClient = new Redis({
      host: this.redisHost,
      port: this.redisPort,
      username: this.redisUsername,
      password: this.redisPassword,
      // Fail fast on individual commands instead of queueing indefinitely
      maxRetriesPerRequest: 3,
      // TCP connection timeout
      connectTimeout: 5000,
      // Retry connecting on disconnect with exponential backoff (max 30s)
      retryStrategy: (times: number) => {
        if (times > 10) {
          this.logger.error('Redis: max reconnect attempts reached, giving up')
          return null // stop retrying
        }
        const delay = Math.min(times * 200, 30_000)
        this.logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`)
        return delay
      }
    })

    this._redisClient.on('ready', () => {
      this.logger.log(`redis client is ready: ${this._redisClient.status}`)
    })

    this._redisClient.on('error', error => {
      this.logger.error(`Error on redis client: ${error}`)
    })
  }

  get client() {
    return this._redisClient
  }

  // ─── Stock Operations ─────────────────────────────────────────────────────

  /** Atomic stock decrement via Lua. Returns remaining >= 0 | -1 insufficient | -2 key not found */
  async decrementStock(
    campaignProductId: string,
    quantity: number
  ): Promise<number> {
    const script = `
      local current = redis.call('GET', KEYS[1])
      if not current then return -2 end
      current = tonumber(current)
      if current < tonumber(ARGV[1]) then return -1 end
      return redis.call('DECRBY', KEYS[1], ARGV[1])
    `
    const result = await this._redisClient.eval(
      script,
      1,
      `stock:${campaignProductId}`,
      String(quantity)
    )
    return result as number
  }

  async initStock(campaignProductId: string, quantity: number): Promise<void> {
    await this._redisClient.set(`stock:${campaignProductId}`, quantity)
  }

  async getStock(campaignProductId: string): Promise<number | null> {
    const val = await this._redisClient.get(`stock:${campaignProductId}`)
    return val !== null ? parseInt(val) : null
  }

  async incrementStock(
    campaignProductId: string,
    quantity: number
  ): Promise<void> {
    await this._redisClient.incrby(`stock:${campaignProductId}`, quantity)
  }

  // ─── Idempotency ──────────────────────────────────────────────────────────

  async setIdempotencyKey(
    key: string,
    value: string,
    ttlSeconds = 86400
  ): Promise<void> {
    await this._redisClient.set(`idem:${key}`, value, 'EX', ttlSeconds)
  }

  async getIdempotencyKey(key: string): Promise<string | null> {
    return this._redisClient.get(`idem:${key}`)
  }

  async setPurchaseRequestIdempotency(
    idempotencyKey: string,
    requestId: string,
    ttlSeconds = 300
  ): Promise<void> {
    await this._redisClient.set(
      `purchase:req:${idempotencyKey}`,
      requestId,
      'EX',
      ttlSeconds
    )
  }

  async getPurchaseRequestIdempotency(
    idempotencyKey: string
  ): Promise<string | null> {
    return this._redisClient.get(`purchase:req:${idempotencyKey}`)
  }

  /**
   * Atomic SET NX — claim idempotency key chỉ khi chưa tồn tại.
   * Trả về true nếu claim thành công, false nếu key đã tồn tại (race condition).
   */
  async claimPurchaseRequestIdempotency(
    idempotencyKey: string,
    requestId: string,
    ttlSeconds = 300
  ): Promise<boolean> {
    const result = await this._redisClient.set(
      `purchase:req:${idempotencyKey}`,
      requestId,
      'EX',
      ttlSeconds,
      'NX'
    )
    return result === 'OK'
  }

  async setPurchaseRequestOwner(
    requestId: string,
    userId: string,
    ttlSeconds = 86400
  ): Promise<void> {
    await this._redisClient.set(
      `purchase:owner:${requestId}`,
      userId,
      'EX',
      ttlSeconds
    )
  }

  async getPurchaseRequestOwner(requestId: string): Promise<string | null> {
    return this._redisClient.get(`purchase:owner:${requestId}`)
  }

  // ─── Reservation Expiry Sorted Set ───────────────────────────────────────

  async addReservationExpiry(
    reservationId: string,
    expiredAtMs: number
  ): Promise<void> {
    await this._redisClient.zadd(
      'reservations:expiry',
      expiredAtMs,
      reservationId
    )
  }

  async getExpiredReservations(nowMs: number, limit = 500): Promise<string[]> {
    return this._redisClient.zrangebyscore(
      'reservations:expiry',
      '-inf',
      nowMs,
      'LIMIT',
      0,
      limit
    )
  }

  async removeReservationExpiry(reservationId: string): Promise<void> {
    await this._redisClient.zrem('reservations:expiry', reservationId)
  }

  // ─── Whitelist ────────────────────────────────────────────────────────────

  async loadWhitelist(campaignId: string, userIds: string[]): Promise<void> {
    if (!userIds.length) return
    await this._redisClient.sadd(`whitelist:${campaignId}`, ...userIds)
    await this._redisClient.expire(`whitelist:${campaignId}`, 86400)
  }

  async isWhitelisted(campaignId: string, userId: string): Promise<boolean> {
    return (
      (await this._redisClient.sismember(`whitelist:${campaignId}`, userId)) ===
      1
    )
  }

  // ─── Purchase Result (for polling) ───────────────────────────────────────

  async setPurchaseResult(requestId: string, result: object): Promise<void> {
    await this._redisClient.set(
      `result:${requestId}`,
      JSON.stringify(result),
      'EX',
      86400
    )
  }

  async getPurchaseResult(requestId: string): Promise<object | null> {
    const val = await this._redisClient.get(`result:${requestId}`)
    return val ? JSON.parse(val) : null
  }

  async setPurchaseFinalResultByIdempotency(
    idempotencyKey: string,
    result: object,
    ttlSeconds = 86400
  ): Promise<void> {
    await this._redisClient.set(
      `purchase:final:${idempotencyKey}`,
      JSON.stringify(result),
      'EX',
      ttlSeconds
    )
  }

  // ─── Reservation Hash ─────────────────────────────────────────────────────

  async setReservation(
    id: string,
    data: Record<string, string>,
    ttlSeconds = 600
  ): Promise<void> {
    await this._redisClient.hset(`reservation:${id}`, data)
    await this._redisClient.expire(`reservation:${id}`, ttlSeconds)
  }

  async getReservation(id: string): Promise<Record<string, string> | null> {
    const data = await this._redisClient.hgetall(`reservation:${id}`)
    return Object.keys(data).length > 0 ? data : null
  }

  async deleteReservation(id: string): Promise<void> {
    await this._redisClient.del(`reservation:${id}`)
  }

  // ─── Dashboard Pub/Sub ────────────────────────────────────────────────────

  async publishDashboardEvent(
    campaignId: string,
    event: object
  ): Promise<void> {
    await this._redisClient.publish(
      `dashboard:${campaignId}`,
      JSON.stringify(event)
    )
  }

  // ─── Token Blacklist ──────────────────────────────────────────────────────

  async blacklistToken(token: string, ttlSeconds: number): Promise<void> {
    await this._redisClient.set(`blacklist:${token}`, '1', 'EX', ttlSeconds)
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    return (await this._redisClient.exists(`blacklist:${token}`)) === 1
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────

  async setRefreshToken(
    userId: string,
    token: string,
    ttlSeconds: number
  ): Promise<void> {
    await this._redisClient.set(`refresh:${userId}`, token, 'EX', ttlSeconds)
  }

  async getRefreshToken(userId: string): Promise<string | null> {
    return this._redisClient.get(`refresh:${userId}`)
  }

  async deleteRefreshToken(userId: string): Promise<void> {
    await this._redisClient.del(`refresh:${userId}`)
  }

  // ─── Distributed Lock (for scheduler cron jobs) ───────────────────────────

  /**
   * Try to acquire a distributed lock via SET NX PX.
   * Returns true if the lock was acquired, false if another instance holds it.
   *
   * Dùng cho scheduler cron jobs: ngăn hai instance chạy cùng lúc khi deploy nhiều pod.
   */
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const token = await this.acquireLockToken(key, ttlMs)
    return token !== null
  }

  async releaseLock(key: string): Promise<void> {
    await this._redisClient.del(`lock:${key}`)
  }

  async acquireLockToken(key: string, ttlMs: number): Promise<string | null> {
    const token = createId()
    const result = await this._redisClient.set(
      `lock:${key}`,
      token,
      'PX',
      ttlMs,
      'NX'
    )
    return result === 'OK' ? token : null
  }

  async releaseLockToken(key: string, token: string): Promise<boolean> {
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `

    const result = await this._redisClient.eval(script, 1, `lock:${key}`, token)
    return Number(result) === 1
  }

  async extendLockToken(
    key: string,
    token: string,
    ttlMs: number
  ): Promise<boolean> {
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('PEXPIRE', KEYS[1], ARGV[2])
      end
      return 0
    `

    const result = await this._redisClient.eval(
      script,
      1,
      `lock:${key}`,
      token,
      String(ttlMs)
    )
    return Number(result) === 1
  }

  // ─── Per-user Purchase Limit (atomic check-and-increment) ────────────────

  /**
   * Atomically check and increment the per-user purchase counter.
   * Returns the new count (>= 1) on success, or -1 if the limit is already reached.
   *
   * Dùng Lua script để đảm bảo check + increment là atomic — tránh race condition
   * khi nhiều request của cùng một user đến đồng thời.
   *
   * @param campaignProductId - campaign product being purchased
   * @param userId            - user making the purchase
   * @param limit             - max purchases allowed per user
   * @param ttlSeconds        - TTL for the counter key (usually campaign duration)
   */
  async incrementPurchaseCount(
    campaignProductId: string,
    userId: string,
    quantity: number,
    limit: number,
    ttlSeconds = 86400
  ): Promise<number> {
    const script = `
      local inc = tonumber(ARGV[1])
      local limit = tonumber(ARGV[2])
      local ttl = tonumber(ARGV[3])
      local current = tonumber(redis.call('GET', KEYS[1]) or '0')
      local new = current + inc
      if current == 0 then
        redis.call('EXPIRE', KEYS[1], ttl)
      end
      if new > limit then
        return -1
      end
      redis.call('SET', KEYS[1], new)
      redis.call('EXPIRE', KEYS[1], ttl)
      return new
    `
    const result = await this._redisClient.eval(
      script,
      1,
      `purchase_limit:${campaignProductId}:${userId}`,
      String(quantity),
      String(limit),
      String(ttlSeconds)
    )
    return result as number
  }

  /**
   * Decrement the per-user purchase counter — called on reservation release/failure.
   */
  async decrementPurchaseCount(
    campaignProductId: string,
    userId: string,
    quantity = 1
  ): Promise<void> {
    const key = `purchase_limit:${campaignProductId}:${userId}`
    const script = `
      local current = tonumber(redis.call('GET', KEYS[1]) or '0')
      if current <= 0 then
        return 0
      end

      local dec = tonumber(ARGV[1])
      local next = current - dec
      if next <= 0 then
        redis.call('DEL', KEYS[1])
        return 0
      end

      local ttl = redis.call('TTL', KEYS[1])
      redis.call('SET', KEYS[1], next)
      if ttl > 0 then
        redis.call('EXPIRE', KEYS[1], ttl)
      end
      return next
    `

    await this._redisClient.eval(script, 1, key, String(quantity))
  }

  async incrementMetricCounter(
    metricName: string,
    value = 1,
    ttlSeconds = 90 * 24 * 60 * 60
  ): Promise<void> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const key = `metrics:${metricName}:${day}`
    await this._redisClient.incrby(key, value)
    await this._redisClient.expire(key, ttlSeconds)
  }
}
