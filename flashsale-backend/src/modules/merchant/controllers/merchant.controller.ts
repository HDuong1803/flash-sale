import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
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
import { ResponseInterceptor } from '@common/interceptors'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { MerchantService } from '../services/merchant.service'
import {
  MerchantConnectService,
  MerchantStripeConnectStatusResponse
} from '../services/merchant-connect.service'
import {
  ApplyMerchantDto,
  MerchantOrderQueryDto,
  MerchantProfileResponseDto,
  MerchantRevenuePeriodDto,
  MerchantRevenueResponseDto,
  MerchantStatsResponseDto
} from '../dto/merchant.dto'

const moduleName = 'merchants'

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly merchantConnectService: MerchantConnectService
  ) {}

  @ApiOperation({ summary: 'Gửi đơn đăng ký trở thành Merchant' })
  @ApiBody({ type: ApplyMerchantDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: MerchantProfileResponseDto,
    description: 'Đăng ký thành công'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'MST đã tồn tại hoặc đã gửi đơn trước đó'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Post('apply')
  @UseGuards(RolesGuard)
  @Roles('CUSTOMER')
  async apply(
    @CurrentUser() user: { userId: string; role: string },
    @Body() dto: ApplyMerchantDto
  ): Promise<MerchantProfileResponseDto> {
    return this.merchantService.apply(user.userId, user.role, dto) as any
  }

  @ApiOperation({ summary: 'Kiểm tra trạng thái đơn đăng ký Merchant' })
  @ApiResponse({ status: HttpStatus.OK, type: MerchantProfileResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Get('application-status')
  @HttpCode(HttpStatus.OK)
  async getApplicationStatus(
    @CurrentUser() user: { userId: string }
  ): Promise<MerchantProfileResponseDto | null> {
    return this.merchantService.getApplicationStatus(user.userId) as any
  }

  @ApiOperation({ summary: 'Lấy danh sách chiến dịch của merchant hiện tại' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách chiến dịch (tất cả trạng thái)'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Get('me/campaigns')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('MERCHANT')
  async getMyCampaigns(
    @CurrentUser() user: { userId: string }
  ): Promise<unknown[]> {
    return this.merchantService.getMyCampaigns(user.userId)
  }

  @ApiOperation({ summary: 'Lấy thông tin Merchant profile' })
  @ApiResponse({ status: HttpStatus.OK, type: MerchantProfileResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy merchant'
  })
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('MERCHANT')
  async getMyProfile(
    @CurrentUser() user: { userId: string }
  ): Promise<MerchantProfileResponseDto> {
    return this.merchantService.getMyProfile(user.userId) as any
  }

  @ApiOperation({ summary: 'Lấy thống kê dashboard Merchant' })
  @ApiResponse({ status: HttpStatus.OK, type: MerchantStatsResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy merchant'
  })
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('MERCHANT')
  async getStats(
    @CurrentUser() user: { userId: string }
  ): Promise<MerchantStatsResponseDto> {
    return this.merchantService.getStats(user.userId)
  }

  @ApiOperation({ summary: 'Thống kê doanh thu theo kỳ' })
  @ApiResponse({ status: HttpStatus.OK, type: MerchantRevenueResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy merchant'
  })
  @Get('revenue')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('MERCHANT')
  async getRevenue(
    @CurrentUser() user: { userId: string },
    @Query() query: MerchantRevenuePeriodDto
  ): Promise<MerchantRevenueResponseDto> {
    return this.merchantService.getRevenue(
      user.userId,
      query
    ) as unknown as MerchantRevenueResponseDto
  }

  @ApiOperation({ summary: 'Lấy danh sách đơn hàng nhận được' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách đơn hàng' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy merchant'
  })
  @Get('orders')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('MERCHANT')
  async getOrders(
    @CurrentUser() user: { userId: string },
    @Query() query: MerchantOrderQueryDto
  ): Promise<unknown[]> {
    return this.merchantService.getOrders(user.userId, query)
  }

  // ─── Stripe Connect ────────────────────────────────────────────────────────

  @ApiOperation({
    summary:
      'Bắt đầu kết nối Stripe Connect (tạo account + lấy onboarding URL)',
    description:
      'Idempotent: nếu đã có account thì chỉ tạo lại Account Link mới. ' +
      'Frontend redirect merchant đến onboardingUrl để hoàn tất KYC trên Stripe.'
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'URL onboarding Stripe Express'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Merchant chưa được duyệt KYC'
  })
  @Post('stripe/connect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('MERCHANT')
  async initiateStripeConnect(
    @CurrentUser() user: { userId: string }
  ): Promise<{ onboardingUrl: string }> {
    return this.merchantConnectService.initiateOnboarding(user.userId)
  }

  @ApiOperation({
    summary:
      'Sync trạng thái Stripe Connect sau khi merchant hoàn tất onboarding',
    description:
      'Gọi sau khi Stripe redirect về return_url. ' +
      'Trả về status mới nhất; nếu chưa hoàn tất sẽ có onboardingUrl để tiếp tục.'
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trạng thái Connect mới nhất'
  })
  @Post('stripe/connect/sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('MERCHANT')
  async syncStripeConnect(
    @CurrentUser() user: { userId: string }
  ): Promise<MerchantStripeConnectStatusResponse> {
    return this.merchantConnectService.syncConnectStatus(user.userId)
  }

  @ApiOperation({
    summary: 'Lấy trạng thái kết nối Stripe hiện tại (không gọi Stripe API)'
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: HttpStatus.OK, description: 'Connect status' })
  @Get('stripe/connect/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('MERCHANT')
  async getStripeConnectStatus(
    @CurrentUser() user: { userId: string }
  ): Promise<MerchantStripeConnectStatusResponse> {
    return this.merchantConnectService.getConnectStatus(user.userId)
  }

  @ApiOperation({
    summary: 'Lấy link vào Stripe Express Dashboard để quản lý payout'
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: HttpStatus.OK, description: 'URL Stripe Dashboard' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chưa hoàn tất kết nối Stripe'
  })
  @Get('stripe/dashboard')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('MERCHANT')
  async getStripeDashboardLink(
    @CurrentUser() user: { userId: string }
  ): Promise<{ url: string }> {
    return this.merchantConnectService.getDashboardLink(user.userId)
  }
}
