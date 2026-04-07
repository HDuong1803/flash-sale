import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { OAuth2Client } from 'google-auth-library'
import { TokenService } from './token.service'
import {
  RegisterDto,
  LoginDto,
  GoogleAuthDto,
  VerifyOtpDto,
  ResendOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto
} from '../dto'
import { AuthUserDto } from '../dto/auth-response.dto'
import { UserRepository } from '@modules/user/repositories/user.repository'
import { UserRole } from '@common/interfaces/role.interface'
import { RedisService } from '@infrastructure/redis/redis.service'
import { EmailService } from '@common/providers/email.service'

/** Internal result — tokens are passed to the controller to set as HttpOnly cookies. */
export interface AuthResult {
  user: AuthUserDto
  accessToken: string
  refreshToken: string
}

export interface OtpRequiredResult {
  status: 'OTP_REQUIRED'
  email: string
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  private googleClient: OAuth2Client
  private readonly googleClientId: string
  private readonly bcryptSalt: number
  private readonly OTP_TTL_SECONDS = 10 * 60 // 10 minutes
  private readonly OTP_COOLDOWN_SECONDS = 60 // 1 minute resend cooldown
  private readonly OTP_RATE_LIMIT_MAX = 3 // max 3 sends per window
  private readonly OTP_RATE_LIMIT_WINDOW_SECONDS = 15 * 60 // 15 minute window
  private readonly RESET_OTP_TTL_SECONDS = 10 * 60 // 10 minutes
  private readonly OTP_MAX_ATTEMPTS = 5 // max wrong attempts before OTP is invalidated
  private readonly LOGIN_MAX_FAILURES = 5
  private readonly LOGIN_LOCKOUT_SECONDS = 15 * 60 // 15 minutes

  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly emailService: EmailService
  ) {
    this.googleClientId = this.configService.get<string>(
      'secrets.GOOGLE_CLIENT_ID',
      ''
    )
    this.bcryptSalt = this.configService.get<number>(
      'application.BCRYPT_SALT',
      10
    )
    this.googleClient = new OAuth2Client(this.googleClientId)
  }

  // ─── OTP helpers ──────────────────────────────────────────────────────────

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  private otpKey(email: string): string {
    return `otp:verify:${email}`
  }

  private otpCooldownKey(email: string): string {
    return `otp:cooldown:${email}`
  }

  private otpRateLimitKey(email: string): string {
    return `otp:rate_limit:${email}`
  }

  private resetOtpKey(email: string): string {
    return `otp:reset:${email}`
  }

  private resetOtpCooldownKey(email: string): string {
    return `otp:cooldown:reset:${email}`
  }

  private resetOtpRateLimitKey(email: string): string {
    return `otp:rate_limit:reset:${email}`
  }

  private otpAttemptsKey(email: string): string {
    return `otp:attempts:verify:${email}`
  }

  private resetOtpAttemptsKey(email: string): string {
    return `otp:attempts:reset:${email}`
  }

  private loginFailuresKey(email: string): string {
    return `login:failures:${email}`
  }

  private loginLockoutKey(email: string): string {
    return `login:lockout:${email}`
  }

  private async sendVerificationOtp(
    email: string,
    fullName: string
  ): Promise<void> {
    // Rate limit: max 3 sends per 15-minute window
    const rateLimitKey = this.otpRateLimitKey(email)
    const count = await this.redis.client.incr(rateLimitKey)
    if (count === 1) {
      // First send in window — set the 15-min expiry
      await this.redis.client.expire(
        rateLimitKey,
        this.OTP_RATE_LIMIT_WINDOW_SECONDS
      )
    }
    if (count > this.OTP_RATE_LIMIT_MAX) {
      // Undo the increment so the count stays accurate
      await this.redis.client.decr(rateLimitKey)
      const ttl = await this.redis.client.ttl(rateLimitKey)
      const minutes = Math.ceil(ttl / 60)
      throw new BadRequestException(
        `Bạn đã gửi quá ${this.OTP_RATE_LIMIT_MAX} mã OTP. Vui lòng thử lại sau ${minutes} phút.`
      )
    }

    const otp = this.generateOtpCode()
    try {
      await this.emailService.sendVerifyOtp(
        email,
        fullName,
        otp,
        this.OTP_TTL_SECONDS / 60
      )
    } catch (err) {
      this.logger.error(`Gửi email xác minh thất bại cho ${email}`, err)
      // Roll back the rate limit counter that was already incremented
      await this.redis.client.decr(rateLimitKey)
      throw new InternalServerErrorException(
        'Không thể gửi email xác minh. Vui lòng thử lại sau.'
      )
    }
    await this.redis.client.set(
      this.otpKey(email),
      otp,
      'EX',
      this.OTP_TTL_SECONDS
    )
    await this.redis.client.set(
      this.otpCooldownKey(email),
      '1',
      'EX',
      this.OTP_COOLDOWN_SECONDS
    )
  }

  // ─── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<OtpRequiredResult> {
    const existing = await this.userRepository.findByEmail(dto.email)

    if (existing) {
      if (existing.emailVerified) {
        throw new BadRequestException('Email đã được sử dụng')
      }
      // Unverified user exists — resend OTP if cooldown passed
      const onCooldown = await this.redis.client.get(
        this.otpCooldownKey(dto.email)
      )
      if (!onCooldown) {
        await this.sendVerificationOtp(dto.email, existing.fullName)
      }
      return { status: 'OTP_REQUIRED', email: dto.email }
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptSalt)
    const user = await this.userRepository.create({
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
      role: UserRole.CUSTOMER
    })

    await this.sendVerificationOtp(dto.email, user.fullName)
    return { status: 'OTP_REQUIRED', email: dto.email }
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResult> {
    // kiểm tra lockout trước khi xử lý — tránh timing oracle
    const lockoutKey = this.loginLockoutKey(dto.email)
    const isLocked = await this.redis.client.get(lockoutKey)
    if (isLocked) {
      const ttl = await this.redis.client.ttl(lockoutKey)
      const minutes = Math.ceil(ttl / 60)
      throw new UnauthorizedException(
        `Tài khoản tạm thời bị khóa do nhập sai quá nhiều lần. Thử lại sau ${minutes} phút.`
      )
    }

    const user = await this.userRepository.findByEmail(dto.email)
    if (!user || !user.passwordHash) {
      // Không tiết lộ email có tồn tại hay không
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng')
    }
    if (user.status === 'BANNED')
      throw new UnauthorizedException('Tài khoản đã bị khóa')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) {
      // Tăng failure counter
      const failKey = this.loginFailuresKey(dto.email)
      const failures = await this.redis.client.incr(failKey)
      if (failures === 1) {
        // Set TTL cho counter bằng thời gian lockout để tự cleanup
        await this.redis.client.expire(failKey, this.LOGIN_LOCKOUT_SECONDS)
      }
      if (failures >= this.LOGIN_MAX_FAILURES) {
        await this.redis.client.set(
          lockoutKey,
          '1',
          'EX',
          this.LOGIN_LOCKOUT_SECONDS
        )
        await this.redis.client.del(failKey)
        this.logger.warn({
          event: 'login_lockout',
          email: dto.email,
          failures
        })
        throw new UnauthorizedException(
          `Tài khoản tạm thời bị khóa do nhập sai quá nhiều lần. Thử lại sau ${
            this.LOGIN_LOCKOUT_SECONDS / 60
          } phút.`
        )
      }
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng')
    }

    if (!user.emailVerified) {
      const onCooldown = await this.redis.client.get(
        this.otpCooldownKey(dto.email)
      )
      if (!onCooldown) {
        await this.sendVerificationOtp(dto.email, user.fullName)
      }

      this.logger.warn(
        `Login blocked: email not verified for user=${dto.email}`
      )

      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Email chưa được xác minh. Vui lòng kiểm tra hộp thư và nhập mã OTP.'
      })
    }

    // Reset failure counter on successful login
    await this.redis.client.del(this.loginFailuresKey(dto.email))

    await this.userRepository.updateLastLogin(user.id)
    return this.buildAuthResult(user)
  }

  // ─── Verify OTP ───────────────────────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResult> {
    const storedOtp = await this.redis.client.get(this.otpKey(dto.email))
    if (!storedOtp) {
      throw new BadRequestException(
        'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.'
      )
    }
    if (storedOtp !== dto.otp) {
      const attemptsKey = this.otpAttemptsKey(dto.email)
      const attempts = await this.redis.client.incr(attemptsKey)
      // Tie attempts TTL to OTP TTL so it cleans itself up
      await this.redis.client.expire(attemptsKey, this.OTP_TTL_SECONDS)
      const remaining = this.OTP_MAX_ATTEMPTS - attempts
      if (remaining <= 0) {
        await this.redis.client.del(this.otpKey(dto.email))
        await this.redis.client.del(attemptsKey)
        throw new BadRequestException(
          'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã OTP mới.'
        )
      }
      throw new BadRequestException(
        `Mã OTP không đúng. Còn ${remaining} lần thử.`
      )
    }

    const user = await this.userRepository.markEmailVerified(dto.email)
    if (!user) throw new NotFoundException('Tài khoản không tồn tại')

    await this.redis.client.del(this.otpKey(dto.email))
    await this.redis.client.del(this.otpCooldownKey(dto.email))
    await this.redis.client.del(this.otpAttemptsKey(dto.email))

    await this.userRepository.updateLastLogin(user.id)
    return this.buildAuthResult(user)
  }

  // ─── Resend OTP ───────────────────────────────────────────────────────────

  async resendOtp(dto: ResendOtpDto): Promise<{ cooldownSeconds: number }> {
    const onCooldown = await this.redis.client.get(
      this.otpCooldownKey(dto.email)
    )
    if (onCooldown) {
      const ttl = await this.redis.client.ttl(this.otpCooldownKey(dto.email))
      throw new BadRequestException(
        `Vui lòng chờ ${ttl} giây trước khi gửi lại mã.`
      )
    }

    const user = await this.userRepository.findByEmail(dto.email)
    if (!user) throw new NotFoundException('Email không tồn tại trong hệ thống')
    if (user.emailVerified)
      throw new BadRequestException('Email đã được xác minh')

    await this.sendVerificationOtp(dto.email, user.fullName)
    return { cooldownSeconds: this.OTP_COOLDOWN_SECONDS }
  }

  // ─── Google Auth ──────────────────────────────────────────────────────────

  async loginWithGoogle(dto: GoogleAuthDto): Promise<AuthResult> {
    if (!this.googleClientId) {
      throw new BadRequestException('Google OAuth chưa được cấu hình')
    }

    let payload: { email?: string; name?: string; sub?: string }
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.token,
        audience: this.googleClientId
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
        role: UserRole.CUSTOMER
      }))

    if (user.status === 'BANNED')
      throw new UnauthorizedException('Tài khoản đã bị khóa')

    // Google auth = email already verified by Google
    if (!user.emailVerified) {
      await this.userRepository.markEmailVerified(payload.email)
    }

    return this.buildAuthResult(user)
  }

  // ─── Refresh / Logout ─────────────────────────────────────────────────────

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

  // ─── Forgot Password ──────────────────────────────────────────────────────

  private async sendResetOtp(email: string, fullName: string): Promise<void> {
    const rateLimitKey = this.resetOtpRateLimitKey(email)
    const count = await this.redis.client.incr(rateLimitKey)
    if (count === 1) {
      await this.redis.client.expire(
        rateLimitKey,
        this.OTP_RATE_LIMIT_WINDOW_SECONDS
      )
    }
    if (count > this.OTP_RATE_LIMIT_MAX) {
      await this.redis.client.decr(rateLimitKey)
      const ttl = await this.redis.client.ttl(rateLimitKey)
      const minutes = Math.ceil(ttl / 60)
      throw new BadRequestException(
        `Bạn đã gửi quá ${this.OTP_RATE_LIMIT_MAX} mã OTP. Vui lòng thử lại sau ${minutes} phút.`
      )
    }

    const otp = this.generateOtpCode()
    try {
      await this.emailService.sendResetPasswordOtp(
        email,
        fullName,
        otp,
        this.RESET_OTP_TTL_SECONDS / 60
      )
    } catch (err) {
      this.logger.error(`Gửi email đặt lại mật khẩu thất bại cho ${email}`, err)
      // Roll back the rate limit counter that was already incremented
      await this.redis.client.decr(rateLimitKey)
      throw new InternalServerErrorException(
        'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.'
      )
    }
    await this.redis.client.set(
      this.resetOtpKey(email),
      otp,
      'EX',
      this.RESET_OTP_TTL_SECONDS
    )
    await this.redis.client.set(
      this.resetOtpCooldownKey(email),
      '1',
      'EX',
      this.OTP_COOLDOWN_SECONDS
    )
  }

  async forgotPassword(
    dto: ForgotPasswordDto
  ): Promise<{ cooldownSeconds: number }> {
    const onCooldown = await this.redis.client.get(
      this.resetOtpCooldownKey(dto.email)
    )
    if (onCooldown) {
      const ttl = await this.redis.client.ttl(
        this.resetOtpCooldownKey(dto.email)
      )
      throw new BadRequestException(
        `Vui lòng chờ ${ttl} giây trước khi gửi lại mã.`
      )
    }

    const user = await this.userRepository.findByEmail(dto.email)
    // Always respond the same way to avoid user enumeration
    if (!user || !user.emailVerified) {
      return { cooldownSeconds: this.OTP_COOLDOWN_SECONDS }
    }

    await this.sendResetOtp(dto.email, user.fullName)
    return { cooldownSeconds: this.OTP_COOLDOWN_SECONDS }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const storedOtp = await this.redis.client.get(this.resetOtpKey(dto.email))
    if (!storedOtp) {
      throw new BadRequestException(
        'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.'
      )
    }
    if (storedOtp !== dto.otp) {
      const attemptsKey = this.resetOtpAttemptsKey(dto.email)
      const attempts = await this.redis.client.incr(attemptsKey)
      await this.redis.client.expire(attemptsKey, this.RESET_OTP_TTL_SECONDS)
      const remaining = this.OTP_MAX_ATTEMPTS - attempts
      if (remaining <= 0) {
        await this.redis.client.del(this.resetOtpKey(dto.email))
        await this.redis.client.del(attemptsKey)
        throw new BadRequestException(
          'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã OTP mới.'
        )
      }
      throw new BadRequestException(
        `Mã OTP không đúng. Còn ${remaining} lần thử.`
      )
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptSalt)
    const user = await this.userRepository.updatePassword(
      dto.email,
      passwordHash
    )
    if (!user) throw new NotFoundException('Tài khoản không tồn tại')

    await this.redis.client.del(this.resetOtpKey(dto.email))
    await this.redis.client.del(this.resetOtpCooldownKey(dto.email))
    await this.redis.client.del(this.resetOtpRateLimitKey(dto.email))
    await this.redis.client.del(this.resetOtpAttemptsKey(dto.email))
    // Revoke all active sessions so old password can't be used
    await this.tokenService.revokeRefreshToken(user.id)
  }

  // ─── Build result ─────────────────────────────────────────────────────────

  private async buildAuthResult(user: {
    id: string
    email: string
    fullName: string
    role: string
    photo?: { url: string } | null
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
        avatarUrl: user.photo?.url ?? undefined
      },
      accessToken,
      refreshToken
    }
  }
}
