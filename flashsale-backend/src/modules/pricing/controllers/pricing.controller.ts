import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  ApiQuery,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { PricingEngineService } from '../services/pricing-engine.service'
import { PricingRepository } from '../repositories/pricing.repository'
import {
  CreatePricingRuleDto,
  PriceHistoryResponseDto,
  PricingRuleResponseDto
} from '../dto/pricing.dto'

const moduleName = 'pricing'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
@UseGuards(AccessTokenGuard, RolesGuard)
export class PricingController {
  constructor(
    private readonly pricingEngine: PricingEngineService,
    private readonly pricingRepo: PricingRepository
  ) {}

  // ─── Merchant endpoints ──────────────────────────────────────────────────────

  @Post(':campaignProductId/rules')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo pricing rule mới cho campaign product' })
  @ApiParam({ name: 'campaignProductId', description: 'Campaign Product ID' })
  @ApiBody({ type: CreatePricingRuleDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Rule đã được tạo',
    type: PricingRuleResponseDto
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async createRule(
    @Param('campaignProductId') campaignProductId: string,
    @Body() dto: CreatePricingRuleDto,
    @CurrentUser() user: { userId: string; role: UserRole }
  ) {
    await this.ensureCampaignProductAccess(campaignProductId, user)

    return this.pricingRepo.createRule({
      campaignProductId,
      name: dto.name,
      strategy: dto.strategy,
      priority: dto.priority ?? 0,
      stockRatioLow: dto.stockRatioLow,
      stockRatioHigh: dto.stockRatioHigh,
      stockAction: dto.stockAction,
      velocityMin: dto.velocityMin,
      velocityMax: dto.velocityMax,
      velocityAction: dto.velocityAction,
      minutesBeforeEnd: dto.minutesBeforeEnd,
      timeAction: dto.timeAction,
      adjustmentPct: dto.adjustmentPct,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice
    })
  }

  @Get(':campaignProductId/rules')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách pricing rules của campaign product' })
  @ApiParam({ name: 'campaignProductId', description: 'Campaign Product ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách rules',
    type: [PricingRuleResponseDto]
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async getRules(
    @Param('campaignProductId') campaignProductId: string,
    @CurrentUser() user: { userId: string; role: UserRole }
  ) {
    await this.ensureCampaignProductAccess(campaignProductId, user)
    return this.pricingRepo.findRules(campaignProductId)
  }

  @Delete('rules/:ruleId')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Vô hiệu hóa một pricing rule' })
  @ApiParam({ name: 'ruleId', description: 'Pricing Rule ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Rule đã vô hiệu hóa' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async deactivateRule(
    @Param('ruleId') ruleId: string,
    @CurrentUser() user: { userId: string; role: UserRole }
  ): Promise<{ ok: boolean }> {
    if (user.role !== UserRole.ADMIN) {
      // Verify ownership for merchants
      const rule = await this.pricingRepo.findRuleWithMerchantCheck(
        ruleId,
        user.userId
      )
      if (!rule) {
        return { ok: false }
      }
    }

    await this.pricingRepo.deactivateRule(ruleId)
    return { ok: true }
  }

  @Get(':campaignProductId/history')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lịch sử thay đổi giá của campaign product' })
  @ApiParam({ name: 'campaignProductId', description: 'Campaign Product ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Số records',
    example: 50
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Price history',
    type: [PriceHistoryResponseDto]
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async getPriceHistory(
    @Param('campaignProductId') campaignProductId: string,
    @CurrentUser() user: { userId: string; role: UserRole },
    @Query('limit') limit?: number
  ) {
    await this.ensureCampaignProductAccess(campaignProductId, user)
    return this.pricingRepo.findPriceHistory(campaignProductId, limit)
  }

  // ─── Admin endpoint: trigger manual pricing cycle ──────────────────────────

  @Post(':campaignProductId/evaluate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: '[Admin] Trigger pricing evaluation ngay lập tức cho một product',
    description:
      'Thay vì đợi cron 5 phút, admin có thể trigger thủ công để demo.'
  })
  @ApiParam({ name: 'campaignProductId', description: 'Campaign Product ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Kết quả evaluation' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async triggerEvaluation(
    @Param('campaignProductId') campaignProductId: string
  ) {
    const decision = await this.pricingEngine.evaluate(campaignProductId)

    if (decision.shouldChange) {
      await this.pricingEngine.applyDecision(
        campaignProductId,
        decision,
        'ADMIN_MANUAL'
      )
    }

    return decision
  }

  private async ensureCampaignProductAccess(
    campaignProductId: string,
    user: { userId: string; role: UserRole }
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) {
      return
    }

    const allowed = await this.pricingRepo.isCampaignProductOwnedByMerchant(
      campaignProductId,
      user.userId
    )
    if (!allowed) {
      throw new ForbiddenException(
        'Không có quyền truy cập campaign product này'
      )
    }
  }
}
