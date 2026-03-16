import {
  BadRequestException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { OAuth2Client } from 'google-auth-library'
import { TokenService } from './token.service'
import { RegisterDto, LoginDto, GoogleAuthDto } from '../dto'
import { AuthUserDto } from '../dto/auth-response.dto'
import { UserRepository } from '@modules/user/repositories/user.repository'
import { UserRole } from '@common/interfaces/role.interface'

/** Internal result — tokens are passed to the controller to set as HttpOnly cookies. */
export interface AuthResult {
  user: AuthUserDto
  accessToken: string
  refreshToken: string
}

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client

  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(dto.email)
    if (existing) throw new BadRequestException('Email đã được sử dụng')

    const passwordHash = await bcrypt.hash(
      dto.password,
      parseInt(process.env.BCRYPT_SALT || '10')
    )

    const user = await this.userRepository.create({
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
      role: UserRole.CUSTOMER
    })

    return this.buildAuthResult(user)
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(dto.email)
    if (!user || !user.passwordHash)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng')
    if (user.status === 'BANNED')
      throw new UnauthorizedException('Tài khoản đã bị khóa')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng')

    await this.userRepository.updateLastLogin(user.id)

    return this.buildAuthResult(user)
  }

  async loginWithGoogle(dto: GoogleAuthDto): Promise<AuthResult> {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new BadRequestException('Google OAuth chưa được cấu hình')
    }

    let payload: {
      email?: string
      name?: string
      picture?: string
      sub?: string
    }
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.token,
        audience: process.env.GOOGLE_CLIENT_ID
      })
      payload = ticket.getPayload() ?? {}
    } catch {
      throw new UnauthorizedException('Google token không hợp lệ')
    }

    if (!payload.email)
      throw new UnauthorizedException('Không thể xác thực với Google')

    const existing = await this.userRepository.findByEmail(payload.email)

    const user =
      existing ??
      (await this.userRepository.create({
        email: payload.email,
        fullName: payload.name ?? payload.email.split('@')[0],
        avatarUrl: payload.picture,
        role: UserRole.CUSTOMER
      }))

    if (user.status === 'BANNED')
      throw new UnauthorizedException('Tài khoản đã bị khóa')

    return this.buildAuthResult(user)
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: { sub: string }
    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken)
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ')
    }

    const valid = await this.tokenService.validateStoredRefreshToken(
      payload.sub,
      refreshToken
    )
    if (!valid) throw new UnauthorizedException('Refresh token đã hết hạn')

    const user = await this.userRepository.findById(payload.sub)
    if (!user) throw new UnauthorizedException('Người dùng không tồn tại')

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role
    })

    return { accessToken }
  }

  async logout(userId: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(userId)
  }

  private async buildAuthResult(user: {
    id: string
    email: string
    fullName: string
    role: string
    avatarUrl?: string | null
  }): Promise<AuthResult> {
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role
    })
    const refreshToken = this.tokenService.generateRefreshToken({
      sub: user.id
    })
    await this.tokenService.storeRefreshToken(user.id, refreshToken)

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl ?? undefined
      },
      accessToken,
      refreshToken
    }
  }
}
