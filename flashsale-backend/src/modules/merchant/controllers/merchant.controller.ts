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
  ApplyMerchantDto,
  MerchantOrderQueryDto,
  MerchantProfileResponseDto,
  MerchantStatsResponseDto
} from '../dto/merchant.dto'

const moduleName = 'merchants'

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

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
    @CurrentUser() user: { userId: string },
    @Body() dto: ApplyMerchantDto
  ): Promise<MerchantProfileResponseDto> {
    return this.merchantService.apply(user.userId, dto) as any
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
}
