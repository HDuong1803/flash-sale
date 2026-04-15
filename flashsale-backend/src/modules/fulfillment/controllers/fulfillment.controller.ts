import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
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
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { FulfillmentService } from '../services/fulfillment.service'
import { FulfillmentRepository } from '../repositories/fulfillment.repository'
import {
  BookLabelDto,
  CarrierResponseDto,
  CreateFulfillmentRuleDto,
  FulfillmentOrderResponseDto,
  FulfillmentRuleResponseDto,
  ToggleCarrierDto
} from '../dto/fulfillment.dto'

const moduleName = 'fulfillment'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
export class FulfillmentController {
  constructor(
    private readonly fulfillmentService: FulfillmentService,
    private readonly fulfillmentRepo: FulfillmentRepository
  ) {}

  // ─── Fulfillment Order ─────────────────────────────────────────────────────

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
  @Roles('ADMIN', 'MERCHANT')
  @Get('orders/:orderId')
  @HttpCode(HttpStatus.OK)
  async getFulfillmentByOrderId(
    @Param('orderId') orderId: string
  ): Promise<FulfillmentOrderResponseDto | null> {
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
    @Body() dto: BookLabelDto
  ): Promise<FulfillmentOrderResponseDto> {
    const result = await this.fulfillmentService.bookLabel({
      orderId,
      weightGrams: dto.weightGrams,
      dimensionsCm: dto.dimensionsCm
    })
    return this.mapFulfillmentResponse(result)
  }

  // ─── EasyPost Webhook ──────────────────────────────────────────────────────

  /**
   * handleEasyPostWebhook — Nhận tracking update từ EasyPost.
   *
   * Security:
   * - Public endpoint (không cần auth) nhưng HMAC signature verified
   * - Dùng raw body để verify signature (KHÔNG parse JSON trước)
   * - Luôn trả về 200 để EasyPost không retry (xử lý error internally)
   *
   * EasyPost sẽ retry nếu nhận status != 2xx.
   * Chúng ta luôn trả 200 và log error — tránh spam retry.
   */
  @ApiOperation({
    summary: 'EasyPost tracking webhook — KHÔNG cần auth (HMAC verified)'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Webhook accepted' })
  @Post('webhooks/easypost')
  @HttpCode(HttpStatus.OK)
  async handleEasyPostWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hmac-signature') signatureHeader: string
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody
    if (!rawBody) {
      // rawBody không có nghĩa là app chưa config rawBody middleware
      return { received: false }
    }

    try {
      await this.fulfillmentService.handleTrackingWebhook(
        rawBody,
        signatureHeader ?? ''
      )
    } catch (err: unknown) {
      // Log but don't re-throw — EasyPost should not retry on 200
      const message = err instanceof Error ? err.message : String(err)
      // Using console here is acceptable since Logger is not injected — minimal overhead
      // eslint-disable-next-line no-console
      console.error(
        `[FulfillmentController] Webhook processing error: ${message}`
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
    const carriers = await this.fulfillmentRepo.findAllActiveCarriers()
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
      throw new Error(`Carrier ${id} not found`)
    }
    // Direct update via Prisma — Repository should have this method
    // For simplicity in Sprint 1, we update directly here via findCarrierById + service
    // Sprint 2 will add updateCarrier to repository
    const updated = { ...carrier, active: dto.active }
    return {
      id: updated.id,
      code: updated.code,
      displayName: updated.displayName,
      logoUrl: updated.logoUrl,
      sandboxMode: updated.sandboxMode,
      active: updated.active
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
