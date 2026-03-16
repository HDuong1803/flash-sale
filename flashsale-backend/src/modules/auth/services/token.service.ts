import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { RedisService } from '@infrastructure/redis/redis.service'

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisService
  ) {}

  generateAccessToken(payload: {
    sub: string
    email: string
    role: string
  }): string {
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET_KEY,
      expiresIn: process.env.JWT_EXPIRE_TIME || '15m'
    })
  }

  generateRefreshToken(payload: { sub: string }): string {
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_PRIVATE_KEY,
      expiresIn: process.env.JWT_EXPIRE_REFRESH_TIME || '7d'
    })
  }

  verifyAccessToken(token: string): {
    sub: string
    email: string
    role: string
  } {
    return this.jwtService.verify(token, { secret: process.env.JWT_SECRET_KEY })
  }

  verifyRefreshToken(token: string): { sub: string } {
    return this.jwtService.verify(token, {
      secret: process.env.JWT_REFRESH_PRIVATE_KEY
    })
  }

  async storeRefreshToken(userId: string, token: string): Promise<void> {
    const ttl = 7 * 24 * 60 * 60 // 7 days in seconds
    await this.redis.setRefreshToken(userId, token, ttl)
  }

  async validateStoredRefreshToken(
    userId: string,
    token: string
  ): Promise<boolean> {
    const stored = await this.redis.getRefreshToken(userId)
    return stored === token
  }

  async revokeRefreshToken(userId: string): Promise<void> {
    await this.redis.deleteRefreshToken(userId)
  }
}
