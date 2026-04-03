import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { OptionalAccessTokenGuard } from '@common/guards/optional-access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { Public } from '@common/decorators/public.decorator'
import {
  CurrentUser,
  OptionalCurrentUser
} from '@common/decorators/current-user.decorator'
import { IUserFromRequest } from '@common/decorators/current-user.decorator'
import { CampaignService } from '../services/campaign.service'
import {
  AddCampaignProductDto,
  CampaignProductResponseDto,
  CommissionCategoryResponseDto,
  CampaignQueryDto,
  CampaignReportResponseDto,
  CampaignResponseDto,
  CreateCampaignDto,
  RescheduleRequestDto,
  RescheduleRequestResponseDto,
  UpdateCampaignDto
} from '../dto/campaign.dto'

const moduleName = 'campaigns'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @ApiOperation({ summary: 'Tạo chiến dịch flash sale mới' })
  @ApiBody({ type: CreateCampaignDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: CampaignResponseDto,
    description: 'Tạo thành công'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dữ liệu không hợp lệ'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Merchant chưa được duyệt'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Post()
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateCampaignDto
  ): Promise<CampaignResponseDto> {
    return this.campaignService.create(
      user.userId,
      dto
    ) as unknown as CampaignResponseDto
  }

  @ApiOperation({ summary: 'Lấy danh sách danh mục hoa hồng đang áp dụng' })
  @ApiResponse({ status: HttpStatus.OK, type: [CommissionCategoryResponseDto] })
  @Get('commission-categories')
  @HttpCode(HttpStatus.OK)
  @Public()
  async getCommissionCategories(): Promise<CommissionCategoryResponseDto[]> {
    return this.campaignService.getCommissionCategories() as unknown as CommissionCategoryResponseDto[]
  }

  @ApiOperation({ summary: 'Lấy danh sách chiến dịch (công khai)' })
  @ApiResponse({ status: HttpStatus.OK, type: [CampaignResponseDto] })
  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async findAll(
    @Query() query: CampaignQueryDto
  ): Promise<CampaignResponseDto[]> {
    return this.campaignService.findAll(
      query
    ) as unknown as CampaignResponseDto[]
  }

  @ApiOperation({
    summary:
      'Lấy chi tiết chiến dịch (public, isPreRegistered nếu đã đăng nhập)'
  })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({ status: HttpStatus.OK, type: CampaignResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalAccessTokenGuard)
  async findOne(
    @Param('id') id: string,
    @OptionalCurrentUser() user: IUserFromRequest | null
  ): Promise<CampaignResponseDto> {
    return this.campaignService.findOne(
      id,
      user?.userId
    ) as unknown as CampaignResponseDto
  }

  @ApiOperation({ summary: 'Cập nhật chiến dịch (chỉ khi DRAFT)' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiBody({ type: UpdateCampaignDto })
  @ApiResponse({ status: HttpStatus.OK, type: CampaignResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chiến dịch không ở trạng thái DRAFT'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto
  ): Promise<CampaignResponseDto> {
    return this.campaignService.update(
      user.userId,
      id,
      dto
    ) as unknown as CampaignResponseDto
  }

  @ApiOperation({ summary: 'Thêm sản phẩm vào chiến dịch' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiBody({ type: AddCampaignProductDto })
  @ApiResponse({ status: HttpStatus.CREATED, type: CampaignProductResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Giá sale hoặc số lượng không hợp lệ'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sản phẩm không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Post(':id/products')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async addProduct(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: AddCampaignProductDto
  ): Promise<CampaignProductResponseDto> {
    return this.campaignService.addProduct(
      user.userId,
      id,
      dto
    ) as unknown as CampaignProductResponseDto
  }

  @ApiOperation({ summary: 'Xóa chiến dịch (chỉ khi DRAFT)' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Xóa thành công' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chiến dịch không ở trạng thái DRAFT'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async delete(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<{ deleted: boolean }> {
    return this.campaignService.delete(user.userId, id)
  }

  @ApiOperation({ summary: 'Ẩn chiến dịch đã kết thúc khỏi danh sách merchant' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ẩn thành công' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chỉ có thể ẩn campaign ở trạng thái ENDED'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Patch(':id/hide-expired')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async hideExpired(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<{ hidden: boolean }> {
    return this.campaignService.hideExpired(user.userId, id)
  }

  @ApiOperation({ summary: 'Xóa sản phẩm khỏi chiến dịch' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiParam({ name: 'productId', description: 'ID sản phẩm' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Xóa thành công' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chiến dịch không ở trạng thái DRAFT'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Delete(':id/products/:productId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async removeProduct(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('productId') productId: string
  ): Promise<{ removed: boolean }> {
    return this.campaignService.removeProduct(user.userId, id, productId)
  }

  @ApiOperation({ summary: 'Gửi chiến dịch để admin duyệt' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({ status: HttpStatus.OK, type: CampaignResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chiến dịch trống hoặc không ở trạng thái DRAFT'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async submit(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<CampaignResponseDto> {
    return this.campaignService.submit(
      user.userId,
      id
    ) as unknown as CampaignResponseDto
  }

  @ApiOperation({
    summary: 'Đăng ký nhận thông báo trước khi chiến dịch bắt đầu'
  })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đăng ký thành công' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chiến dịch không nhận đăng ký trước'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Post(':id/register')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('CUSTOMER', 'MERCHANT')
  async preRegister(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<{ registered: boolean }> {
    return this.campaignService.preRegister(user.userId, id)
  }

  @ApiOperation({
    summary: 'Huỷ đăng ký nhận thông báo trước khi chiến dịch bắt đầu'
  })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Huỷ đăng ký thành công' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chưa đăng ký hoặc chiến dịch không hợp lệ'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Delete(':id/register')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('CUSTOMER', 'MERCHANT')
  async cancelPreRegister(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<{ registered: boolean }> {
    return this.campaignService.cancelPreRegister(user.userId, id)
  }

  @ApiOperation({ summary: 'Xem báo cáo hiệu quả chiến dịch' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({ status: HttpStatus.OK, type: CampaignReportResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Get(':id/report')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async getReport(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<CampaignReportResponseDto> {
    return this.campaignService.getReport(user.userId, id)
  }

  // ─── Reschedule ───────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Lấy danh sách yêu cầu thay đổi lịch đang chờ xác nhận'
  })
  @ApiResponse({ status: HttpStatus.OK, type: [RescheduleRequestResponseDto] })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Merchant chưa được duyệt'
  })
  @ApiBearerAuth('JWT-auth')
  @Get('reschedule-requests/pending')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async getMerchantPendingRescheduleRequests(
    @CurrentUser() user: { userId: string }
  ): Promise<RescheduleRequestResponseDto[]> {
    return this.campaignService.getMerchantPendingRescheduleRequests(
      user.userId
    )
  }

  @ApiOperation({ summary: 'Merchant xác nhận yêu cầu force start từ admin' })
  @ApiParam({ name: 'requestId', description: 'ID yêu cầu đổi lịch' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đã xác nhận, lịch đã được cập nhật',
    type: RescheduleRequestResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Yêu cầu không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Yêu cầu không hợp lệ'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không có quyền' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Post('reschedule-requests/:requestId/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async confirmAdminReschedule(
    @CurrentUser() user: { userId: string },
    @Param('requestId') requestId: string
  ): Promise<RescheduleRequestResponseDto> {
    return this.campaignService.confirmAdminReschedule(user.userId, requestId)
  }

  @ApiOperation({ summary: 'Merchant từ chối yêu cầu force start từ admin' })
  @ApiParam({ name: 'requestId', description: 'ID yêu cầu đổi lịch' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đã từ chối yêu cầu' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Yêu cầu không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Yêu cầu không hợp lệ'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không có quyền' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Post('reschedule-requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async rejectAdminReschedule(
    @CurrentUser() user: { userId: string },
    @Param('requestId') requestId: string
  ): Promise<{ rejected: boolean }> {
    return this.campaignService.rejectAdminReschedule(user.userId, requestId)
  }

  @ApiOperation({
    summary: 'Merchant yêu cầu thay đổi lịch bắt đầu chiến dịch'
  })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiBody({ type: RescheduleRequestDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Đã tạo yêu cầu',
    type: RescheduleRequestResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dữ liệu không hợp lệ'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không có quyền' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Post(':id/reschedule-request')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('MERCHANT')
  async createRescheduleRequest(
    @CurrentUser() user: { userId: string },
    @Param('id') campaignId: string,
    @Body() dto: RescheduleRequestDto
  ): Promise<RescheduleRequestResponseDto> {
    return this.campaignService.createRescheduleRequest(
      user.userId,
      campaignId,
      dto
    )
  }
}
