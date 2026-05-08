import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { Request } from 'express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import {
  CurrentUser,
  IUserFromRequest
} from '@common/decorators/current-user.decorator'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { FulfillmentService } from '../services/fulfillment.service'
import { FulfillmentPollingService } from '../services/fulfillment-polling.service'
import { FulfillmentRepository } from '../repositories/fulfillment.repository'
import {
  BookLabelDto,
  CarrierResponseDto,
  CreateFulfillmentRuleDto,
  FulfillmentOrderResponseDto,
  FulfillmentRuleResponseDto,
  PendingQcOrderResponseDto,
  ToggleCarrierDto
} from '../dto/fulfillment.dto'

const moduleName = 'fulfillment'

interface AuthUser extends IUserFromRequest {
  role: 'ADMIN' | 'MERCHANT' | 'CUSTOMER'
}

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
export class FulfillmentController {
  constructor(
    private readonly fulfillmentService: FulfillmentService,
    private readonly fulfillmentPolling: FulfillmentPollingService,
    private readonly fulfillmentRepo: FulfillmentRepository
  ) {}

  // ─── Fulfillment Order ─────────────────────────────────────────────────────

  /**
   * GET /fulfillment/orders/pending-qc
   *
   * Trả về danh sách FulfillmentOrders đang AWAITING/ADDRESS_ISSUE cần xử lý QC.
   * ADMIN: tất cả đơn; MERCHANT: chỉ đơn của merchant đó.
   *
   * Route tĩnh PHẢI đặt trước route động `:orderId` để NestJS không nhầm
   * "pending-qc" là một orderId.
   */
  @ApiOperation({
    summary: 'Danh sách đơn cần xử lý fulfillment/QC (ADMIN/MERCHANT)'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách đơn chờ xử lý',
    type: [PendingQcOrderResponseDto]
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN', 'MERCHANT')
  @Get('orders/pending-qc')
  @HttpCode(HttpStatus.OK)
  async getPendingQcOrders(
    @CurrentUser() user: AuthUser
  ): Promise<PendingQcOrderResponseDto[]> {
    const merchantUserId = user.role === 'MERCHANT' ? user.userId : undefined
    const rows = await this.fulfillmentRepo.findPendingQcOrders(merchantUserId)

    return rows.map(r => ({
      orderId: r.orderId,
      fulfillStatus: r.fulfillStatus,
      slaDeadline: r.slaDeadline?.toISOString() ?? null,
      slaBreached: r.slaBreached,
      carrier: r.carrier
        ? { code: r.carrier.code, displayName: r.carrier.displayName }
        : null,
      qcStatus: r.order.qcCheckpoint?.status ?? null,
      qcInspector: r.order.qcCheckpoint?.inspector ?? null,
      order: {
        totalAmount: parseFloat(r.order.totalAmount.toString()),
        createdAt: r.order.createdAt.toISOString(),
        itemCount: r.order._count.items
      }
    }))
  }

  @ApiOperation({ summary: 'Lấy trạng thái fulfillment của một đơn hàng' })
  @ApiParam({ name: 'orderId', description: 'ID đơn hàng' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trạng thái fulfillment',
    type: FulfillmentOrderResponseDto
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Không tìm thấy' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN', 'MERCHANT', 'CUSTOMER')
  @Get('orders/:orderId')
  @HttpCode(HttpStatus.OK)
  async getFulfillmentByOrderId(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser
  ): Promise<FulfillmentOrderResponseDto | null> {
    await this.assertOrderAccess(orderId, user, true)
    const fulfillment = await this.fulfillmentRepo.findByOrderId(orderId)
    if (!fulfillment) return null
    return this.mapFulfillmentResponse(fulfillment)
  }

  @ApiOperation({ summary: 'Mua shipping label cho đơn hàng (ADMIN/MERCHANT)' })
  @ApiParam({ name: 'orderId', description: 'ID đơn hàng' })
  @ApiBody({ type: BookLabelDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Label đã được mua thành công',
    type: FulfillmentOrderResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy fulfillment order'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không có quyền' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN', 'MERCHANT')
  @Post('orders/:orderId/book-label')
  @HttpCode(HttpStatus.OK)
  async bookLabel(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: BookLabelDto
  ): Promise<FulfillmentOrderResponseDto> {
    await this.assertOrderAccess(orderId, user, false)
    const result = await this.fulfillmentService.bookLabel({
      orderId,
      weightGrams: dto.weightGrams,
      dimensionsCm: dto.dimensionsCm
    })
    return this.mapFulfillmentResponse(result)
  }

  // ─── Manual Sync ──────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Đồng bộ trạng thái vận chuyển từ GHN (dùng khi không có webhook)'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Số đơn đã đồng bộ và số lỗi'
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN', 'MERCHANT')
  @Post('sync-status')
  @HttpCode(HttpStatus.OK)
  async syncShippingStatuses(): Promise<{ synced: number; errors: number }> {
    return this.fulfillmentPolling.triggerManualSync()
  }

  // ─── GHN Webhook ──────────────────────────────────────────────────────────

  /**
   * handleGHNWebhook — Nhận tracking update từ GHN.
   *
   * Security:
   * - Public endpoint (không cần auth) nhưng token-based verified
   * - GHN không dùng HMAC — dùng token đơn giản trong header X-GHN-Token
   * - Dùng raw body để parse payload (KHÔNG parse JSON trước)
   * - Luôn trả về 200 để GHN không retry (xử lý error internally)
   *
   * GHN sẽ retry 10 lần cách nhau 5 giây nếu nhận status != 200.
   * Chúng ta luôn trả 200 và log error — tránh spam retry.
   */
  @ApiOperation({
    summary: 'GHN tracking webhook — KHÔNG cần auth (token verified)'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Webhook accepted' })
  @Post('webhooks/ghn')
  @HttpCode(HttpStatus.OK)
  async handleGHNWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-ghn-token') webhookToken: string
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody
    if (!rawBody) {
      // rawBody không có → app chưa config rawBody middleware
      return { received: false }
    }

    try {
      await this.fulfillmentService.handleGHNWebhook(
        rawBody,
        webhookToken ?? ''
      )
    } catch (err: unknown) {
      // Log but don't re-throw — GHN should not retry on 200
      const message = err instanceof Error ? err.message : String(err)
      // Using console here is acceptable since Logger is not injected
      // eslint-disable-next-line no-console
      console.error(
        `[FulfillmentController] GHN Webhook processing error: ${message}`
      )
    }

    return { received: true }
  }

  // ─── Carriers (Admin) ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách carriers (ADMIN)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách carriers',
    type: [CarrierResponseDto]
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Chỉ ADMIN' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('carriers')
  @HttpCode(HttpStatus.OK)
  async getCarriers(): Promise<CarrierResponseDto[]> {
    const carriers = await this.fulfillmentRepo.findAllCarriers()
    return carriers.map(c => ({
      id: c.id,
      code: c.code,
      displayName: c.displayName,
      logoUrl: c.logoUrl,
      sandboxMode: c.sandboxMode,
      active: c.active
    }))
  }

  @ApiOperation({ summary: 'Toggle carrier active/inactive (ADMIN)' })
  @ApiParam({ name: 'id', description: 'ID carrier' })
  @ApiBody({ type: ToggleCarrierDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đã cập nhật' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Chỉ ADMIN' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('carriers/:id/toggle')
  @HttpCode(HttpStatus.OK)
  async toggleCarrier(
    @Param('id') id: string,
    @Body() dto: ToggleCarrierDto
  ): Promise<CarrierResponseDto> {
    const carrier = await this.fulfillmentRepo.findCarrierById(id)
    if (!carrier) {
      throw new NotFoundException(`Carrier ${id} not found`)
    }

    const updated = await this.fulfillmentRepo.updateCarrierActive(
      id,
      dto.active
    )
    return {
      id: updated.id,
      code: updated.code,
      displayName: updated.displayName,
      logoUrl: updated.logoUrl,
      sandboxMode: updated.sandboxMode,
      active: updated.active
    }
  }

  private async assertOrderAccess(
    orderId: string,
    user: AuthUser,
    allowCustomer: boolean
  ): Promise<void> {
    const access = await this.fulfillmentRepo.findOrderAccessContext(orderId)
    if (!access) {
      throw new NotFoundException(`Order ${orderId} not found`)
    }

    if (user.role === 'ADMIN') return

    if (user.role === 'MERCHANT' && access.merchantUserId !== user.userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập đơn hàng này')
    }

    if (!allowCustomer && user.role === 'CUSTOMER') {
      throw new ForbiddenException(
        'Customer không được phép thực hiện hành động này'
      )
    }

    if (allowCustomer && user.role === 'CUSTOMER') {
      if (access.customerId !== user.userId) {
        throw new ForbiddenException('Bạn không có quyền truy cập đơn hàng này')
      }
    }
  }

  // ─── Fulfillment Rules (Admin) ─────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy danh sách fulfillment rules (ADMIN)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách rules',
    type: [FulfillmentRuleResponseDto]
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Chỉ ADMIN' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('rules')
  @HttpCode(HttpStatus.OK)
  async getFulfillmentRules(): Promise<FulfillmentRuleResponseDto[]> {
    const rules = await this.fulfillmentRepo.findActiveRules()
    return rules.map(r => this.mapRuleResponse(r))
  }

  @ApiOperation({ summary: 'Tạo fulfillment rule mới (ADMIN)' })
  @ApiBody({ type: CreateFulfillmentRuleDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Rule đã tạo',
    type: FulfillmentRuleResponseDto
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Chỉ ADMIN' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  async createFulfillmentRule(
    @Body() dto: CreateFulfillmentRuleDto
  ): Promise<FulfillmentRuleResponseDto> {
    const rule = await this.fulfillmentRepo.createRule({
      name: dto.name,
      priority: dto.priority,
      minWeightGrams: dto.minWeightGrams ?? null,
      maxWeightGrams: dto.maxWeightGrams ?? null,
      minOrderCents: dto.minOrderCents ?? null,
      maxOrderCents: dto.maxOrderCents ?? null,
      destCountry: dto.destCountry ?? null,
      destState: dto.destState ?? null,
      carrierId: dto.carrierId,
      slaHours: dto.slaHours
    })
    return this.mapRuleResponse(rule)
  }

  @ApiOperation({ summary: 'Deactivate fulfillment rule (ADMIN)' })
  @ApiParam({ name: 'id', description: 'ID rule' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Rule đã deactivate' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Chỉ ADMIN' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('rules/:id')
  @HttpCode(HttpStatus.OK)
  async deactivateRule(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.fulfillmentRepo.deactivateRule(id)
    return { success: true }
  }

  // ─── Private mappers ───────────────────────────────────────────────────────

  private mapFulfillmentResponse(
    f: Awaited<ReturnType<FulfillmentRepository['findByOrderId']>>
  ): FulfillmentOrderResponseDto {
    if (!f) throw new Error('Fulfillment not found')
    return {
      id: f.id,
      orderId: f.orderId,
      fulfillStatus: f.fulfillStatus,
      carrier: f.carrier
        ? { code: f.carrier.code, displayName: f.carrier.displayName }
        : null,
      trackingNumber: f.trackingNumber,
      trackingUrl: f.trackingUrl,
      labelUrl: f.labelUrl,
      labelPdfUrl: f.labelPdfUrl,
      slaDeadline: f.slaDeadline?.toISOString() ?? null,
      slaBreached: f.slaBreached,
      labelCostCents: f.labelCostCents,
      normalizedAddress: f.normalizedAddress as object | null,
      trackingEvents: f.trackingEvents.map(e => ({
        id: e.id,
        carrierStatus: e.carrierStatus,
        description: e.description,
        location: e.location,
        occurredAt: e.occurredAt.toISOString()
      }))
    }
  }

  private mapRuleResponse(
    r: Awaited<ReturnType<FulfillmentRepository['findActiveRules']>>[number]
  ): FulfillmentRuleResponseDto {
    return {
      id: r.id,
      name: r.name,
      priority: r.priority,
      minWeightGrams: r.minWeightGrams,
      maxWeightGrams: r.maxWeightGrams,
      minOrderCents: r.minOrderCents,
      maxOrderCents: r.maxOrderCents,
      destCountry: r.destCountry,
      destState: r.destState,
      carrier: {
        id: r.carrier.id,
        code: r.carrier.code,
        displayName: r.carrier.displayName
      },
      slaHours: r.slaHours,
      active: r.active
    }
  }
}
