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
  AuthResponseDto
} from '../dto'
import { AuthUserDto } from '../dto/auth-response.dto'
import { Public } from '@common/decorators/public.decorator'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'

const ACCESS_TOKEN_TTL = Number(process.env.JWT_EXPIRE_TIME ?? 900) * 1000
const REFRESH_TOKEN_TTL =
  Number(process.env.JWT_EXPIRE_REFRESH_TIME ?? 604800) * 1000

@ApiTags('auth')
@Controller('auth')
@UseInterceptors(ResponseInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
    const isProd = process.env.NODE_ENV === 'production'
    const base = { httpOnly: true, sameSite: 'lax' as const, secure: isProd }

    res.cookie('access_token', accessToken, {
      ...base,
      maxAge: ACCESS_TOKEN_TTL,
      path: '/'
    })
    res.cookie('refresh_token', refreshToken, {
      ...base,
      maxAge: REFRESH_TOKEN_TTL,
      path: '/api/v1/auth'
    })
    // Not HttpOnly — Next.js middleware reads this for RBAC (role is not a secret)
    res.cookie('user-role', role, {
      sameSite: 'lax',
      secure: isProd,
      maxAge: REFRESH_TOKEN_TTL,
      path: '/'
    })
  }

  private clearAuthCookies(res: Response): void {
    const opts = { path: '/' }
    res.clearCookie('access_token', opts)
    res.clearCookie('refresh_token', { path: '/api/v1/auth' })
    res.clearCookie('user-role', opts)
  }

  // ─── Endpoints ────────────────────────────────────────────────────────────

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Đăng ký thành công — tokens delivered via HttpOnly cookies',
    type: AuthResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Email đã được sử dụng'
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ user: AuthUserDto }> {
    const { user, accessToken, refreshToken } = await this.authService.register(
      dto
    )
    this.setAuthCookies(res, accessToken, refreshToken, user.role)
    return { user }
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng email và mật khẩu' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đăng nhập thành công — tokens delivered via HttpOnly cookies',
    type: AuthResponseDto
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Email hoặc mật khẩu không đúng'
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
    summary: 'Làm mới access token — đọc refresh_token từ cookie'
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

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ACCESS_TOKEN_TTL,
      path: '/'
    })
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Đăng xuất — xóa tất cả auth cookies' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đăng xuất thành công' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async logout(
    @CurrentUser() user: { userId: string },
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    await this.authService.logout(user.userId)
    this.clearAuthCookies(res)
  }
}
