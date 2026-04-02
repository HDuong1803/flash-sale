import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { Request, Response } from 'express'
import { AuthService } from '../services/auth.service'
import {
  RegisterDto,
  LoginDto,
  GoogleAuthDto,
  RefreshDto,
  AuthResponseDto,
  VerifyOtpDto,
  ResendOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto
} from '../dto'
import { AuthUserDto } from '../dto/auth-response.dto'
import { Public } from '@common/decorators/public.decorator'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'

@ApiTags('auth')
@Controller('auth')
@UseInterceptors(ResponseInterceptor)
export class AuthController {
  private readonly accessTokenTtl: number
  private readonly refreshTokenTtl: number
  private readonly isProd: boolean

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {
    this.accessTokenTtl =
      this.configService.get<number>('secrets.JWT_EXPIRE_TIME', 900) * 1000
    this.refreshTokenTtl =
      this.configService.get<number>(
        'secrets.JWT_EXPIRE_REFRESH_TIME',
        604800
      ) * 1000
    this.isProd = this.configService.get<boolean>('application.isProd', false)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getCookieSecurityOptions(): {
    sameSite: 'lax' | 'none'
    secure: boolean
  } {
    // Cross-site HTTPS (frontend domain != backend domain) requires SameSite=None + Secure.
    if (this.isProd) {
      return { sameSite: 'none', secure: true }
    }

    return { sameSite: 'lax', secure: false }
  }

  /**
   * Set access_token + refresh_token as HttpOnly cookies.
   * Also sets a plain user-role cookie (not HttpOnly) for Next.js middleware RBAC checks.
   *
   * Cookie path notes:
   *   access_token  → path='/'          so browser sends it everywhere (incl. Next.js pages for middleware)
   *   refresh_token → path='/api/v1/auth' limits exposure to auth endpoints only
   *   user-role     → path='/'          Next.js middleware needs to read this on any page request
   */
  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    role: string
  ): void {
    const security = this.getCookieSecurityOptions()

    const base = {
      httpOnly: true,
      sameSite: security.sameSite,
      secure: security.secure
    }

    res.cookie('access_token', accessToken, {
      ...base,
      maxAge: this.accessTokenTtl,
      path: '/'
    })
    res.cookie('refresh_token', refreshToken, {
      ...base,
      maxAge: this.refreshTokenTtl,
      path: '/api/v1/auth'
    })
    // Not HttpOnly — Next.js middleware reads this for RBAC (role is not a secret)
    res.cookie('user-role', role, {
      sameSite: security.sameSite,
      secure: security.secure,
      maxAge: this.refreshTokenTtl,
      path: '/'
    })
  }

  private clearAuthCookies(res: Response): void {
    const security = this.getCookieSecurityOptions()
    const opts = {
      path: '/',
      sameSite: security.sameSite,
      secure: security.secure
    }
    res.clearCookie('access_token', opts)
    res.clearCookie('refresh_token', {
      path: '/api/v1/auth',
      sameSite: security.sameSite,
      secure: security.secure
    })
    res.clearCookie('user-role', opts)
  }

  // ─── Endpoints ────────────────────────────────────────────────────────────

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Đăng ký tài khoản — gửi OTP xác minh email' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'OTP đã được gửi đến email — chờ xác minh'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Email đã được sử dụng'
  })
  async register(
    @Body() dto: RegisterDto
  ): Promise<{ status: string; email: string }> {
    return this.authService.register(dto)
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng email và mật khẩu' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đăng nhập thành công — token được trả qua cookie HttpOnly',
    type: AuthResponseDto
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Email hoặc mật khẩu không đúng'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Email chưa được xác minh — OTP đã được gửi'
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ user: AuthUserDto }> {
    const { user, accessToken, refreshToken } = await this.authService.login(
      dto
    )
    this.setAuthCookies(res, accessToken, refreshToken, user.role)
    return { user }
  }

  @Post('google')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng Google' })
  @ApiBody({ type: GoogleAuthDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Đăng nhập Google thành công — tokens delivered via HttpOnly cookies',
    type: AuthResponseDto
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Google token không hợp lệ'
  })
  async loginWithGoogle(
    @Body() dto: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ user: AuthUserDto }> {
    const { user, accessToken, refreshToken } =
      await this.authService.loginWithGoogle(dto)
    this.setAuthCookies(res, accessToken, refreshToken, user.role)
    return { user }
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Làm mới mã truy cập — đọc refresh_token từ cookie'
  })
  @ApiBody({ type: RefreshDto, required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Access token mới được set qua cookie'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Refresh token không hợp lệ'
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    // Primary: read from HttpOnly cookie (browser-based clients)
    // Fallback: accept body field for Swagger / non-browser clients
    const refreshToken: string | undefined =
      (req.cookies as Record<string, string | undefined>)['refresh_token'] ??
      (req.body as RefreshDto | undefined)?.refreshToken

    const { accessToken } = await this.authService.refresh(refreshToken ?? '')

    const security = this.getCookieSecurityOptions()

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      sameSite: security.sameSite,
      secure: security.secure,
      maxAge: this.accessTokenTtl,
      path: '/'
    })
  }

  @Post('verify-otp')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác minh OTP đăng ký tài khoản' })
  @ApiBody({ type: VerifyOtpDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Xác minh thành công — tokens set qua cookie',
    type: AuthResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'OTP không đúng hoặc đã hết hạn'
  })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ user: AuthUserDto }> {
    const { user, accessToken, refreshToken } =
      await this.authService.verifyOtp(dto)
    this.setAuthCookies(res, accessToken, refreshToken, user.role)
    return { user }
  }

  @Post('resend-otp')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi lại mã OTP xác minh email' })
  @ApiBody({ type: ResendOtpDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đã gửi OTP mới' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Đang trong thời gian chờ hoặc email không tồn tại'
  })
  async resendOtp(
    @Body() dto: ResendOtpDto
  ): Promise<{ cooldownSeconds: number }> {
    return this.authService.resendOtp(dto)
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi OTP đặt lại mật khẩu qua email' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đã gửi OTP (nếu email tồn tại)'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Đang trong thời gian chờ hoặc đã vượt giới hạn'
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto
  ): Promise<{ cooldownSeconds: number }> {
    return this.authService.forgotPassword(dto)
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng OTP' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đặt lại mật khẩu thành công'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'OTP không đúng hoặc đã hết hạn'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Tài khoản không tồn tại'
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto)
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Đăng xuất — xóa toàn bộ cookie xác thực' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đăng xuất thành công' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  async logout(
    @CurrentUser() user: { userId: string },
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    await this.authService.logout(user.userId)
    this.clearAuthCookies(res)
  }
}
