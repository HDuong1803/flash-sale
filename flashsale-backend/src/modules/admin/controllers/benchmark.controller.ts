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
  RunAllBenchmarkDto,
  RunBenchmarkDto,
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
