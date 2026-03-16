import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { Public } from '@common/decorators/public.decorator'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { CampaignService } from '../services/campaign.service'
import {
  AddCampaignProductDto,
  CampaignProductResponseDto,
  CampaignQueryDto,
  CampaignReportResponseDto,
  CampaignResponseDto,
  CreateCampaignDto,
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

  @ApiOperation({ summary: 'Lấy danh sách chiến dịch (public)' })
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

  @ApiOperation({ summary: 'Lấy chi tiết chiến dịch (public)' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({ status: HttpStatus.OK, type: CampaignResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Public()
  async findOne(@Param('id') id: string): Promise<CampaignResponseDto> {
    return this.campaignService.findOne(id) as unknown as CampaignResponseDto
  }

  @ApiOperation({ summary: 'Cập nhật chiến dịch (chỉ khi DRAFT)' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
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
  @ApiParam({ name: 'id', description: 'Campaign ID' })
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

  @ApiOperation({ summary: 'Xóa sản phẩm khỏi chiến dịch' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
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
  @ApiParam({ name: 'id', description: 'Campaign ID' })
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
  @ApiParam({ name: 'id', description: 'Campaign ID' })
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

  @ApiOperation({ summary: 'Xem báo cáo hiệu quả chiến dịch' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
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
}
