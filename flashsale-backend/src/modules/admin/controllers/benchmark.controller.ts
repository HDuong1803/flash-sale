import {
  Body,
  Controller,
  Delete,
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
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { BenchmarkService } from '../services/benchmark.service'
import { StockAuditRepository } from '@modules/order/repositories/stock-audit.repository'
import {
  BenchmarkComparisonDto,
  BenchmarkResultDto,
  BenchmarkRunDto,
  BenchmarkHistoryQueryDto,
  RunAllBenchmarkDto,
  RunBenchmarkDto,
  StartBenchmarkDto,
  StockAuditQueryDto
} from '../dto/benchmark.dto'

const moduleName = 'admin/benchmark'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BenchmarkController {
  constructor(
    private readonly benchmarkService: BenchmarkService,
    private readonly stockAuditRepo: StockAuditRepository
  ) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chạy benchmark một strategy',
    description:
      'Mô phỏng N concurrent requests với strategy được chọn. ' +
      'Stock của CampaignProduct sẽ bị reset tạm thời cho mục đích test.'
  })
  @ApiBody({ type: RunBenchmarkDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Kết quả benchmark',
    type: BenchmarkResultDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation error'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async runBenchmark(
    @Body() dto: RunBenchmarkDto
  ): Promise<BenchmarkResultDto> {
    return this.benchmarkService.runScenario(dto)
  }

  @Post('run-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chạy benchmark so sánh cả 3 strategies',
    description:
      'Chạy tuần tự NO_LOCK → DB_LOCK → REDIS_LUA với cùng config. ' +
      'Kết quả cho thấy sự khác biệt rõ ràng về throughput và correctness.'
  })
  @ApiBody({ type: RunAllBenchmarkDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Kết quả so sánh 3 strategies',
    type: BenchmarkComparisonDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation error'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async runAllStrategies(
    @Body() dto: RunAllBenchmarkDto
  ): Promise<BenchmarkComparisonDto> {
    return this.benchmarkService.runAllStrategies(dto)
  }

  // ─── Async benchmark endpoints ─────────────────────────────────────────────

  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Bắt đầu benchmark background job',
    description:
      'Tạo benchmark job bất đồng bộ — trả về runId ngay lập tức (202 Accepted). ' +
      'Dùng GET /runs/:id để poll trạng thái. Strategy: NO_LOCK | DB_LOCK | REDIS_LUA | ALL.'
  })
  @ApiBody({ type: StartBenchmarkDto })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Job đã được tạo, trả về runId',
    schema: { properties: { runId: { type: 'string' } } }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation error'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async startBenchmark(
    @Body() dto: StartBenchmarkDto
  ): Promise<{ runId: string }> {
    return this.benchmarkService.startBenchmark(dto)
  }

  @Get('runs/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy trạng thái benchmark run',
    description:
      'Poll trạng thái của một benchmark run theo ID. Cập nhật mỗi 2 giây từ frontend.'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trạng thái và kết quả benchmark run',
    type: BenchmarkRunDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Run không tồn tại'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async getRunStatus(@Param('id') id: string): Promise<BenchmarkRunDto> {
    return this.benchmarkService.getRunStatus(id)
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lịch sử benchmark runs',
    description:
      'Danh sách tất cả benchmark runs có phân trang, sắp xếp theo thời gian tạo mới nhất.'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách benchmark runs'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async getHistory(@Query() query: BenchmarkHistoryQueryDto): Promise<{
    items: BenchmarkRunDto[]
    total: number
    page: number
    limit: number
  }> {
    return this.benchmarkService.getHistory(query.page ?? 1, query.limit ?? 20)
  }

  @Delete('runs/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dừng benchmark run đang chạy',
    description:
      'Terminate worker thread và đánh dấu run là FAILED. ' +
      'Chỉ hoạt động với run đang RUNNING hoặc PENDING.'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Job đã được dừng',
    schema: { properties: { killed: { type: 'boolean' } } }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Run không tồn tại'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async killRun(@Param('id') id: string): Promise<{ killed: boolean }> {
    await this.benchmarkService.killRun(id)
    return { killed: true }
  }

  @Get('audit-logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xem stock audit log',
    description:
      'Xem lịch sử mọi thao tác stock, có thể filter theo strategy và oversell'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách audit logs'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async getAuditLogs(@Query() query: StockAuditQueryDto) {
    return this.stockAuditRepo.findMany({
      productId: query.productId,
      isOversell: query.isOversell,
      strategy: query.strategy,
      page: query.page,
      limit: query.limit
    })
  }
}
