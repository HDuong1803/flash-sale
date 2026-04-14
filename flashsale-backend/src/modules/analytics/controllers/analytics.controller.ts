import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import {
  ApiBearerAuth,
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
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { AnalyticsService } from '../services/analytics.service'
import { PredictionService } from '../services/prediction.service'
import {
  CampaignOverviewResponseDto,
  FunnelStepDto,
  HeatmapHourDto,
  SnapshotResponseDto,
  StockoutPredictionResponseDto,
  TimeSeriesQueryDto
} from '../dto/analytics.dto'

const moduleName = 'analytics'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
@UseGuards(AccessTokenGuard, RolesGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly predictionService: PredictionService
  ) {}

  // ─── Campaign-level overview ────────────────────────────────────────────────

  @Get('campaigns/:campaignId/overview')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy snapshot mới nhất của campaign' })
  @ApiParam({ name: 'campaignId', description: 'Campaign ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Latest analytics snapshot',
    type: CampaignOverviewResponseDto
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async getCampaignOverview(
    @Param('campaignId') campaignId: string
  ): Promise<CampaignOverviewResponseDto | null> {
    return this.analyticsService.getCampaignOverview(campaignId)
  }

  // ─── Funnel analytics ───────────────────────────────────────────────────────

  @Get('campaigns/:campaignId/funnel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Dữ liệu funnel chuyển đổi của campaign',
    description:
      'Trả về count + conversionRate + dropoffRate cho từng step funnel'
  })
  @ApiParam({ name: 'campaignId', description: 'Campaign ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Funnel data by step',
    type: [FunnelStepDto]
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async getFunnelData(
    @Param('campaignId') campaignId: string
  ): Promise<FunnelStepDto[]> {
    return this.analyticsService.getFunnelData(campaignId)
  }

  // ─── Time-series ────────────────────────────────────────────────────────────

  @Get('campaigns/:campaignId/products/:campaignProductId/time-series')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Time-series snapshots của một campaign product',
    description:
      'Dùng để vẽ biểu đồ stock/revenue theo thời gian. Tối đa 288 điểm (24h).'
  })
  @ApiParam({ name: 'campaignId', description: 'Campaign ID' })
  @ApiParam({ name: 'campaignProductId', description: 'Campaign Product ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Số snapshots (max 288)',
    example: 48
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Time-series data',
    type: [SnapshotResponseDto]
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async getTimeSeries(
    @Param('campaignId') campaignId: string,
    @Param('campaignProductId') campaignProductId: string,
    @Query() query: TimeSeriesQueryDto
  ): Promise<SnapshotResponseDto[]> {
    return this.analyticsService.getTimeSeries(
      campaignId,
      campaignProductId,
      query.limit
    )
  }

  // ─── Hourly heatmap ─────────────────────────────────────────────────────────

  @Get('campaigns/:campaignId/heatmap')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Heatmap thanh toán theo giờ trong ngày',
    description:
      'Trả về mảng 24 phần tử (0-23 giờ) với số lượng PAYMENT_SUCCESS.'
  })
  @ApiParam({ name: 'campaignId', description: 'Campaign ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Hourly heatmap data',
    type: [HeatmapHourDto]
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async getHourlyHeatmap(
    @Param('campaignId') campaignId: string
  ): Promise<HeatmapHourDto[]> {
    return this.analyticsService.getHourlyHeatmap(campaignId)
  }

  // ─── Stockout prediction ────────────────────────────────────────────────────

  @Get('campaigns/:campaignId/products/:campaignProductId/predict-stockout')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Dự đoán thời điểm hết hàng bằng linear regression',
    description:
      'Dùng OLS (Ordinary Least Squares) trên chuỗi snapshot gần nhất. ' +
      'confidence = R² (0-1). trend: STABLE | DECLINING | ACCELERATING | SOLD_OUT. ' +
      'stockoutAt = null nếu không dự đoán được trong 2 giờ tới.'
  })
  @ApiParam({
    name: 'campaignId',
    description: 'Campaign ID (chỉ dùng để validate context)'
  })
  @ApiParam({ name: 'campaignProductId', description: 'Campaign Product ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stockout prediction result',
    type: StockoutPredictionResponseDto
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async predictStockout(
    @Param('campaignProductId') campaignProductId: string
  ): Promise<StockoutPredictionResponseDto> {
    return this.predictionService.predictStockout(campaignProductId)
  }

  // ─── Admin: batch prediction ────────────────────────────────────────────────

  @Get('campaigns/:campaignId/predict-all')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: '[Admin] Dự đoán stockout cho tất cả products trong campaign',
    description:
      'Chạy parallel prediction. Products bị lỗi sẽ bị bỏ qua (logged).'
  })
  @ApiParam({ name: 'campaignId', description: 'Campaign ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Array of predictions',
    type: [StockoutPredictionResponseDto]
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async predictAll(
    @Param('campaignId') campaignId: string
  ): Promise<StockoutPredictionResponseDto[]> {
    // Fetch all product IDs for this campaign
    const productIds = await this.getProductIds(campaignId)
    return this.predictionService.predictMany(productIds)
  }

  /**
   * Helper lấy danh sách campaign product IDs mà không cần tạo thêm repository.
   * AnalyticsRepository đã xử lý getCampaignStartTime và getCampaignProductTotal.
   * Với batch prediction, gọi predictMany — nội bộ sẽ fetch snapshot theo từng product.
   *
   * Lưu ý: Ủy quyền cho AnalyticsService vốn đã có AnalyticsRepository được inject.
   * Việc ánh xạ campaignId → productIds được thực hiện gián tiếp qua analytics repo.
   * Trong trường hợp phức tạp hơn có thể thêm method repo riêng, nhưng với use case
   * này prediction service đã tự xử lý đúng theo từng product.
   */
  private async getProductIds(campaignId: string): Promise<string[]> {
    // We need a way to list campaign product IDs.
    // Since AnalyticsController only has AnalyticsService and PredictionService injected,
    // we add a method to AnalyticsService to list active product IDs.
    return this.analyticsService.getCampaignProductIds(campaignId)
  }
}
