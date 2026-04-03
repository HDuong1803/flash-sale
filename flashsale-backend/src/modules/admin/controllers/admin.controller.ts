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
import { PaymentMethod, KycStatus, PaymentStatus } from '@prisma/client'
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
  ForceRescheduleDto,
  MerchantOverviewQueryDto,
  OrdersByHourItemDto,
  OrdersByTimeQueryDto,
  QueueStatsResponseDto,
  RejectReasonDto,
  RescheduleRequestQueryDto,
  RevenueTrendItemDto,
  SystemHealthResponseDto,
  FinanceDashboardSummaryDto,
  FinanceTrendItemDto,
  CommissionCategoryBreakdownDto,
  CampaignMonitorOverviewDto,
  CampaignMonitorQueryDto,
  CampaignMonitorTimelineItemDto,
  CampaignMonitorTimelineQueryDto,
  PaymentGatewayConfigDto,
  UpdatePaymentGatewayConfigDto
} from '../dto/admin.dto'
import { CurrentUser } from '@common/decorators/current-user.decorator'

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
  @ApiParam({ name: 'id', description: 'ID hồ sơ merchant' })
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
  @ApiParam({ name: 'id', description: 'ID hồ sơ merchant' })
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

  @ApiOperation({ summary: 'Lấy danh sách chiến dịch (góc nhìn admin)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách chiến dịch' })
  @Get('campaigns')
  @HttpCode(HttpStatus.OK)
  async getCampaigns(
    @Query() query: AdminCampaignQueryDto
  ): Promise<unknown[]> {
    return this.adminService.getCampaigns(query.status)
  }

  @ApiOperation({ summary: 'Duyệt chiến dịch' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Duyệt thành công, status = APPROVED'
  })
  @Patch('campaigns/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveCampaign(@Param('id') id: string): Promise<unknown> {
    return this.adminService.approveCampaign(id)
  }

  @ApiOperation({ summary: 'Từ chối chiến dịch (đưa về DRAFT)' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
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

  @ApiOperation({ summary: 'Xóa mềm chiến dịch đã kết thúc (ENDED)' })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Xóa thành công chiến dịch đã kết thúc'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chỉ xóa được chiến dịch ở trạng thái ENDED'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @Delete('campaigns/:id')
  @HttpCode(HttpStatus.OK)
  async deleteExpiredCampaign(
    @Param('id') id: string
  ): Promise<{ deleted: boolean }> {
    return this.adminService.deleteExpiredCampaign(id)
  }

  @ApiOperation({
    summary: 'Xem danh sách tất cả yêu cầu thay đổi lịch chiến dịch'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách yêu cầu' })
  @Get('campaigns/reschedule-requests')
  @HttpCode(HttpStatus.OK)
  async getRescheduleRequests(
    @Query() query: RescheduleRequestQueryDto
  ): Promise<unknown[]> {
    return this.adminService.getRescheduleRequests(query)
  }

  @ApiOperation({
    summary:
      'Buộc bắt đầu chiến dịch ngay lập tức (chỉ dùng cho gỡ lỗi/kiểm thử)'
  })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chiến dịch đã chuyển sang ACTIVE ngay lập tức'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chiến dịch không ở trạng thái SCHEDULED'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @Post('campaigns/:id/force-start')
  @HttpCode(HttpStatus.OK)
  async forceStartCampaign(
    @Param('id') campaignId: string
  ): Promise<{ started: boolean }> {
    return this.adminService.forceStartCampaign(campaignId)
  }

  @ApiOperation({
    summary: 'Buộc dừng chiến dịch ngay lập tức (chỉ dùng cho gỡ lỗi/kiểm thử)'
  })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Chiến dịch đã chuyển sang ENDED ngay lập tức, stock đã sync về DB'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chiến dịch không ở trạng thái ACTIVE'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @Post('campaigns/:id/force-stop')
  @HttpCode(HttpStatus.OK)
  async forceStopCampaign(
    @Param('id') campaignId: string
  ): Promise<{ stopped: boolean }> {
    return this.adminService.forceStopCampaign(campaignId)
  }

  @ApiOperation({
    summary: 'Admin tạo yêu cầu force thay đổi lịch bắt đầu chiến dịch'
  })
  @ApiParam({ name: 'id', description: 'ID chiến dịch' })
  @ApiBody({ type: ForceRescheduleDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Yêu cầu đã được tạo, chờ merchant xác nhận'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Chiến dịch không ở trạng thái SCHEDULED'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chiến dịch không tồn tại'
  })
  @Post('campaigns/:id/force-reschedule')
  @HttpCode(HttpStatus.CREATED)
  async forceReschedule(
    @CurrentUser() user: { userId: string },
    @Param('id') campaignId: string,
    @Body() dto: ForceRescheduleDto
  ): Promise<unknown> {
    return this.adminService.forceReschedule(user.userId, campaignId, dto)
  }

  @ApiOperation({ summary: 'Admin duyệt yêu cầu thay đổi lịch từ merchant' })
  @ApiParam({ name: 'requestId', description: 'ID yêu cầu đổi lịch' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đã duyệt, lịch chiến dịch đã được cập nhật'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Yêu cầu không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Yêu cầu không hợp lệ'
  })
  @Patch('campaigns/reschedule-requests/:requestId/approve')
  @HttpCode(HttpStatus.OK)
  async approveRescheduleRequest(
    @CurrentUser() user: { userId: string },
    @Param('requestId') requestId: string
  ): Promise<{ approved: boolean }> {
    return this.adminService.approveRescheduleRequest(user.userId, requestId)
  }

  @ApiOperation({ summary: 'Admin từ chối yêu cầu thay đổi lịch từ merchant' })
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
  @Patch('campaigns/reschedule-requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectRescheduleRequest(
    @CurrentUser() user: { userId: string },
    @Param('requestId') requestId: string
  ): Promise<{ rejected: boolean }> {
    return this.adminService.rejectRescheduleRequest(user.userId, requestId)
  }

  // ─── Users ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách người dùng' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách người dùng' })
  @Get('users')
  @HttpCode(HttpStatus.OK)
  async getUsers(@Query() query: AdminUserQueryDto): Promise<unknown[]> {
    return this.adminService.getUsers(query)
  }

  @ApiOperation({ summary: 'Khoá tài khoản user' })
  @ApiParam({ name: 'id', description: 'ID người dùng' })
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
  @ApiParam({ name: 'id', description: 'ID người dùng' })
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
  @ApiParam({ name: 'id', description: 'ID job DLQ' })
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
  @ApiParam({ name: 'id', description: 'ID job DLQ' })
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
  @ApiResponse({ status: HttpStatus.OK, description: 'Mảng bản ghi nhật ký' })
  @Get('system/logs')
  @HttpCode(HttpStatus.OK)
  async getSystemLogs(): Promise<object[]> {
    return this.adminService.getSystemLogs()
  }

  // ─── Payments (admin) ────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách thanh toán (admin)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách thanh toán' })
  @Get('payments')
  @HttpCode(HttpStatus.OK)
  async getAdminPayments(@Query('status') status?: string): Promise<unknown[]> {
    return this.adminService.getAdminPayments(
      status as PaymentStatus | undefined
    )
  }

  @ApiOperation({ summary: 'Dashboard tài chính hoa hồng (admin)' })
  @ApiResponse({ status: HttpStatus.OK, type: FinanceDashboardSummaryDto })
  @Get('finance/summary')
  @HttpCode(HttpStatus.OK)
  async getFinanceSummary(): Promise<FinanceDashboardSummaryDto> {
    return this.adminService.getFinanceSummary() as unknown as FinanceDashboardSummaryDto
  }

  @ApiOperation({ summary: 'Xu hướng doanh thu hoa hồng theo ngày (admin)' })
  @ApiResponse({ status: HttpStatus.OK, type: [FinanceTrendItemDto] })
  @Get('finance/trend')
  @HttpCode(HttpStatus.OK)
  async getFinanceTrend(): Promise<FinanceTrendItemDto[]> {
    return this.adminService.getFinanceTrend() as unknown as FinanceTrendItemDto[]
  }

  @ApiOperation({ summary: 'Phân rã doanh thu hoa hồng theo danh mục (admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [CommissionCategoryBreakdownDto]
  })
  @Get('finance/by-category')
  @HttpCode(HttpStatus.OK)
  async getFinanceByCategory(): Promise<CommissionCategoryBreakdownDto[]> {
    return this.adminService.getFinanceCategoryBreakdown() as unknown as CommissionCategoryBreakdownDto[]
  }

  @ApiOperation({ summary: 'Lấy cấu hình các cổng thanh toán của hệ thống' })
  @ApiResponse({ status: HttpStatus.OK, type: [PaymentGatewayConfigDto] })
  @Get('payments/gateways')
  @HttpCode(HttpStatus.OK)
  async getPaymentGatewayConfigs(): Promise<PaymentGatewayConfigDto[]> {
    return this.adminService.getPaymentGatewayConfigs() as unknown as PaymentGatewayConfigDto[]
  }

  @ApiOperation({
    summary: 'Tổng quan monitor chiến dịch theo cửa sổ thời gian'
  })
  @ApiResponse({ status: HttpStatus.OK, type: CampaignMonitorOverviewDto })
  @Get('campaign-monitor/overview')
  @HttpCode(HttpStatus.OK)
  async getCampaignMonitorOverview(
    @Query() query: CampaignMonitorQueryDto
  ): Promise<CampaignMonitorOverviewDto> {
    return this.adminService.getCampaignMonitorOverview(
      query
    ) as unknown as CampaignMonitorOverviewDto
  }

  @ApiOperation({
    summary: 'Timeline monitor chiến dịch theo bucket thời gian'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [CampaignMonitorTimelineItemDto]
  })
  @Get('campaign-monitor/timeline')
  @HttpCode(HttpStatus.OK)
  async getCampaignMonitorTimeline(
    @Query() query: CampaignMonitorTimelineQueryDto
  ): Promise<CampaignMonitorTimelineItemDto[]> {
    return this.adminService.getCampaignMonitorTimeline(
      query
    ) as unknown as CampaignMonitorTimelineItemDto[]
  }

  @ApiOperation({ summary: 'Cập nhật cấu hình 1 cổng thanh toán' })
  @ApiParam({ name: 'gateway', enum: PaymentMethod })
  @ApiBody({ type: UpdatePaymentGatewayConfigDto })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentGatewayConfigDto })
  @Patch('payments/gateways/:gateway')
  @HttpCode(HttpStatus.OK)
  async updatePaymentGatewayConfig(
    @Param('gateway') gateway: string,
    @Body() dto: UpdatePaymentGatewayConfigDto
  ): Promise<PaymentGatewayConfigDto> {
    return this.adminService.updatePaymentGatewayConfig(
      gateway as PaymentMethod,
      dto
    ) as unknown as PaymentGatewayConfigDto
  }

  // ─── Customer Profiles (admin) ───────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách hồ sơ customer (admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách hồ sơ khách hàng'
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
    description: 'Danh sách hồ sơ merchant'
  })
  @Get('merchant-profiles')
  @HttpCode(HttpStatus.OK)
  async getMerchantProfiles(
    @Query('status') status?: string
  ): Promise<unknown[]> {
    return this.adminService.getMerchants(status as KycStatus | undefined)
  }

  @ApiOperation({ summary: 'Lấy thống kê chi tiết 1 merchant (admin)' })
  @ApiParam({ name: 'id', description: 'Merchant profile ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thông tin chi tiết merchant, KPI, chiến dịch, đơn hàng'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Merchant không tồn tại'
  })
  @Get('merchant-profiles/:id/overview')
  @HttpCode(HttpStatus.OK)
  async getMerchantOverview(
    @Param('id') merchantId: string,
    @Query() query: MerchantOverviewQueryDto
  ): Promise<unknown> {
    return this.adminService.getMerchantOverview(merchantId, query.days)
  }

  // ─── Notifications (admin) ───────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách thông báo (admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách thông báo'
  })
  @Get('notifications')
  @HttpCode(HttpStatus.OK)
  async getAdminNotifications(): Promise<unknown[]> {
    return this.adminService.getAdminNotifications()
  }

  // ─── Stock Audit Logs (admin) ────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách stock audit log (admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Nhật ký kiểm kê tồn kho'
  })
  @Get('stock-audit-logs')
  @HttpCode(HttpStatus.OK)
  async getStockAuditLogs(): Promise<unknown[]> {
    return this.adminService.getStockAuditLogs()
  }

  // ─── User Action Logs (admin) ────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách user action log (admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Nhật ký thao tác người dùng'
  })
  @Get('user-action-logs')
  @HttpCode(HttpStatus.OK)
  async getUserActionLogs(): Promise<unknown[]> {
    return this.adminService.getUserActionLogs()
  }

  // ─── Outbox Events (admin) ───────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách outbox events (admin)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Sự kiện chờ gửi' })
  @Get('outbox-events')
  @HttpCode(HttpStatus.OK)
  async getOutboxEvents(): Promise<unknown[]> {
    return this.adminService.getOutboxEvents()
  }
}
