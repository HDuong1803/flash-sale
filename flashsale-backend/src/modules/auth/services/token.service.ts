import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { RedisService } from '@infrastructure/redis/redis.service'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService
  ) {}

  generateAccessToken(payload: {
    sub: string
    email: string
    role: string
  }): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET_KEY'),
      expiresIn: Number(this.configService.get('JWT_EXPIRE_TIME'))
    })
  }

  generateRefreshToken(payload: { sub: string }): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_PRIVATE_KEY'),
      expiresIn: Number(this.configService.get('JWT_EXPIRE_REFRESH_TIME'))
    })
  }

  verifyAccessToken(token: string): {
    sub: string
    email: string
    role: string
  } {
    return this.jwtService.verify(token, {
      secret: this.configService.get('JWT_SECRET_KEY')
    })
  }

  verifyRefreshToken(token: string): { sub: string } {
    return this.jwtService.verify(token, {
      secret: this.configService.get('JWT_REFRESH_PRIVATE_KEY')
    })
  }

  async storeRefreshToken(userId: string, token: string): Promise<void> {
    const ttl = 7 * 24 * 60 * 60 // 7 days in seconds
    await this.redisService.setRefreshToken(userId, token, ttl)
  }

  async validateStoredRefreshToken(
    userId: string,
    token: string
  ): Promise<boolean> {
    const stored = await this.redisService.getRefreshToken(userId)
    return stored === token
  }

  async revokeRefreshToken(userId: string): Promise<void> {
    await this.redisService.deleteRefreshToken(userId)
  }
}
