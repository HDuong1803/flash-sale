import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import {
  KycStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus
} from '@prisma/client'
import { ResponseInterceptor } from '@common/interceptors'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { AdminGuard } from '@common/guards/admin.guard'
import { AdminService } from '../services/admin.service'
import {
  ActivityItemDto,
  AdminCampaignQueryDto,
  AdminMerchantQueryDto,
  AdminStatsResponseDto,
  AdminUserQueryDto,
  DlqJobResponseDto,
  OrdersByHourItemDto,
  OrdersByTimeQueryDto,
  QueueStatsResponseDto,
  RejectReasonDto,
  RevenueTrendItemDto,
  SystemHealthResponseDto
} from '../dto/admin.dto'

const moduleName = 'admin'

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard, AdminGuard)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Merchants ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách merchant' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách merchant' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Chỉ ADMIN' })
  @Get('merchants')
  @HttpCode(HttpStatus.OK)
  async getMerchants(
    @Query() query: AdminMerchantQueryDto
  ): Promise<unknown[]> {
    return this.adminService.getMerchants(query.status)
  }

  @ApiOperation({ summary: 'Duyệt đơn đăng ký merchant' })
  @ApiParam({ name: 'id', description: 'MerchantProfile ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Duyệt thành công, user.role = MERCHANT'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Merchant không tồn tại'
  })
  @Patch('merchants/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveMerchant(
    @Param('id') id: string
  ): Promise<{ success: boolean }> {
    return this.adminService.approveMerchant(id)
  }

  @ApiOperation({ summary: 'Từ chối đơn đăng ký merchant' })
  @ApiParam({ name: 'id', description: 'MerchantProfile ID' })
  @ApiBody({ type: RejectReasonDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Từ chối thành công' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Merchant không tồn tại'
  })
  @Patch('merchants/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectMerchant(
    @Param('id') id: string,
    @Body() dto: RejectReasonDto
  ): Promise<unknown> {
    return this.adminService.rejectMerchant(id, dto.reason)
  }

  // ─── Campaigns ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách chiến dịch (admin view)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách campaigns' })
  @Get('campaigns')
  @HttpCode(HttpStatus.OK)
  async getCampaigns(
    @Query() query: AdminCampaignQueryDto
  ): Promise<unknown[]> {
    return this.adminService.getCampaigns(query.status)
  }

  @ApiOperation({ summary: 'Duyệt chiến dịch' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Duyệt thành công, status = APPROVED'
  })
  @Patch('campaigns/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveCampaign(@Param('id') id: string): Promise<unknown> {
    return this.adminService.approveCampaign(id)
  }

  @ApiOperation({ summary: 'Từ chối chiến dịch (revert về DRAFT)' })
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: RejectReasonDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Từ chối, status = DRAFT'
  })
  @Patch('campaigns/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectCampaign(@Param('id') id: string): Promise<unknown> {
    return this.adminService.rejectCampaign(id)
  }

  // ─── Users ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách người dùng' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách users' })
  @Get('users')
  @HttpCode(HttpStatus.OK)
  async getUsers(@Query() query: AdminUserQueryDto): Promise<unknown[]> {
    return this.adminService.getUsers(query)
  }

  @ApiOperation({ summary: 'Khoá tài khoản user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Khoá thành công, status = BANNED'
  })
  @Patch('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendUser(@Param('id') id: string): Promise<unknown> {
    return this.adminService.suspendUser(id)
  }

  @ApiOperation({ summary: 'Kích hoạt lại tài khoản user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Kích hoạt thành công, status = ACTIVE'
  })
  @Patch('users/:id/activate')
  @HttpCode(HttpStatus.OK)
  async activateUser(@Param('id') id: string): Promise<unknown> {
    return this.adminService.activateUser(id)
  }

  // ─── Statistics ─────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Thống kê tổng quan hệ thống' })
  @ApiResponse({ status: HttpStatus.OK, type: AdminStatsResponseDto })
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats(): Promise<AdminStatsResponseDto> {
    return this.adminService.getStats()
  }

  @ApiOperation({
    summary:
      'Biểu đồ đơn hàng theo khoảng thời gian (nhóm theo giờ nếu ≤2 ngày, theo ngày nếu dài hơn)'
  })
  @ApiResponse({ status: HttpStatus.OK, type: [OrdersByHourItemDto] })
  @Get('stats/orders-by-time')
  @HttpCode(HttpStatus.OK)
  async getOrdersByTime(
    @Query() query: OrdersByTimeQueryDto
  ): Promise<{ bucket: string; orders: number }[]> {
    return this.adminService.getOrdersByTime(
      new Date(query.start),
      new Date(query.end)
    )
  }

  @ApiOperation({ summary: 'Biểu đồ doanh thu 7 ngày gần nhất' })
  @ApiResponse({ status: HttpStatus.OK, type: [RevenueTrendItemDto] })
  @Get('stats/revenue-trend')
  @HttpCode(HttpStatus.OK)
  async getRevenueTrend(): Promise<RevenueTrendItemDto[]> {
    return this.adminService.getRevenueTrend()
  }

  @ApiOperation({ summary: 'Danh sách hoạt động gần đây' })
  @ApiResponse({ status: HttpStatus.OK, type: [ActivityItemDto] })
  @Get('activity')
  @HttpCode(HttpStatus.OK)
  async getActivity(): Promise<ActivityItemDto[]> {
    return this.adminService.getActivity()
  }

  // ─── Dead Letter Queue ───────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách jobs thất bại (DLQ)' })
  @ApiResponse({ status: HttpStatus.OK, type: [DlqJobResponseDto] })
  @Get('dead-letter-queue')
  @HttpCode(HttpStatus.OK)
  async getDeadLetterJobs(): Promise<DlqJobResponseDto[]> {
    return this.adminService.getDeadLetterJobs() as unknown as DlqJobResponseDto[]
  }

  @ApiOperation({ summary: 'Retry một job thất bại' })
  @ApiParam({ name: 'id', description: 'DLQ Job ID' })
  @ApiResponse({ status: HttpStatus.OK, description: '{ retried: true }' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Job không tồn tại'
  })
  @Post('dead-letter-queue/:id/retry')
  @HttpCode(HttpStatus.OK)
  async retryJob(@Param('id') id: string): Promise<{ retried: boolean }> {
    return this.adminService.retryJob(id)
  }

  @ApiOperation({ summary: 'Xoá job thất bại khỏi DLQ' })
  @ApiParam({ name: 'id', description: 'DLQ Job ID' })
  @ApiResponse({ status: HttpStatus.OK, description: '{ discarded: true }' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Job không tồn tại'
  })
  @Delete('dead-letter-queue/:id')
  @HttpCode(HttpStatus.OK)
  async discardJob(@Param('id') id: string): Promise<{ discarded: boolean }> {
    return this.adminService.discardJob(id)
  }

  // ─── System ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Kiểm tra trạng thái hệ thống' })
  @ApiResponse({ status: HttpStatus.OK, type: SystemHealthResponseDto })
  @Get('system/health')
  @HttpCode(HttpStatus.OK)
  async getSystemHealth(): Promise<SystemHealthResponseDto> {
    return this.adminService.getSystemHealth()
  }

  @ApiOperation({ summary: 'Thống kê queue RabbitMQ' })
  @ApiResponse({ status: HttpStatus.OK, type: QueueStatsResponseDto })
  @Get('system/queue-stats')
  @HttpCode(HttpStatus.OK)
  async getQueueStats(): Promise<QueueStatsResponseDto> {
    return this.adminService.getQueueStats()
  }

  @ApiOperation({ summary: 'Xem system logs gần nhất (50 entries)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Array of log objects' })
  @Get('system/logs')
  @HttpCode(HttpStatus.OK)
  async getSystemLogs(): Promise<object[]> {
    return this.adminService.getSystemLogs()
  }

  // ─── Orders (admin) ─────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách đơn hàng (admin)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách orders' })
  @Get('orders')
  @HttpCode(HttpStatus.OK)
  async getAdminOrders(@Query('status') status?: string): Promise<unknown[]> {
    return this.adminService.getAdminOrders(status as OrderStatus | undefined)
  }

  // ─── Payments (admin) ────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách thanh toán (admin)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách payments' })
  @Get('payments')
  @HttpCode(HttpStatus.OK)
  async getAdminPayments(@Query('status') status?: string): Promise<unknown[]> {
    return this.adminService.getAdminPayments(
      status as PaymentStatus | undefined
    )
  }

  // ─── Products (admin) ────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách sản phẩm (admin)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách products' })
  @Get('products')
  @HttpCode(HttpStatus.OK)
  async getAdminProducts(@Query('status') status?: string): Promise<unknown[]> {
    return this.adminService.getAdminProducts(
      status as ProductStatus | undefined
    )
  }

  // ─── Customer Profiles (admin) ───────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách hồ sơ customer (admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách customer profiles'
  })
  @Get('customer-profiles')
  @HttpCode(HttpStatus.OK)
  async getCustomerProfiles(): Promise<unknown[]> {
    return this.adminService.getCustomerProfiles()
  }

  // ─── Merchant Profiles (admin) ───────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách hồ sơ merchant đầy đủ (admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách merchant profiles'
  })
  @Get('merchant-profiles')
  @HttpCode(HttpStatus.OK)
  async getMerchantProfiles(
    @Query('status') status?: string
  ): Promise<unknown[]> {
    return this.adminService.getMerchants(status as KycStatus | undefined)
  }

  // ─── Notifications (admin) ───────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách thông báo (admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách notifications'
  })
  @Get('notifications')
  @HttpCode(HttpStatus.OK)
  async getAdminNotifications(): Promise<unknown[]> {
    return this.adminService.getAdminNotifications()
  }

  // ─── Stock Audit Logs (admin) ────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách stock audit log (admin)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Stock audit logs' })
  @Get('stock-audit-logs')
  @HttpCode(HttpStatus.OK)
  async getStockAuditLogs(): Promise<unknown[]> {
    return this.adminService.getStockAuditLogs()
  }

  // ─── User Action Logs (admin) ────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách user action log (admin)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User action logs' })
  @Get('user-action-logs')
  @HttpCode(HttpStatus.OK)
  async getUserActionLogs(): Promise<unknown[]> {
    return this.adminService.getUserActionLogs()
  }

  // ─── Outbox Events (admin) ───────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách outbox events (admin)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Outbox events' })
  @Get('outbox-events')
  @HttpCode(HttpStatus.OK)
  async getOutboxEvents(): Promise<unknown[]> {
    return this.adminService.getOutboxEvents()
  }
}
