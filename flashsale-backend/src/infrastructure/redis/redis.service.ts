import { Logger } from '@common/logger'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
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
      process.env.REDIS_HOST || ''
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
      password: this.redisPassword
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

  async getExpiredReservations(nowMs: number): Promise<string[]> {
    return this._redisClient.zrangebyscore('reservations:expiry', '-inf', nowMs)
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
}
