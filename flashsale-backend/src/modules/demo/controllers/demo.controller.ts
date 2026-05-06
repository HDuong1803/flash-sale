import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseInterceptors
} from '@nestjs/common'
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { DemoService } from '../services/demo.service'
import {
  JobStartedResponseDto,
  JobStatusDto,
  StartLoadTestDto,
  StartSeedDto
} from '../dto/demo.dto'

const moduleName = 'demo'

/**
 * DemoController — REST API cho demo và load test module
 *
 * QUAN TRỌNG: Module này chỉ dùng cho mục đích demo/test.
 * Xóa module này trước khi ra production thực tế.
 *
 * Các endpoint:
 *   POST /demo/seed          → khởi động background job tạo dữ liệu lịch sử
 *   POST /demo/load-test     → khởi động background job load test
 *   GET  /demo/jobs/:jobId   → poll trạng thái job
 *   DELETE /demo/cleanup     → xóa toàn bộ dữ liệu lịch sử đã seed
 */
@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  // ─── POST /demo/seed ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Khởi động job tạo dữ liệu lịch sử (background)' })
  @ApiBody({ type: StartSeedDto })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description:
      'Job đã được khởi động, dùng GET /demo/jobs/:jobId để theo dõi',
    type: JobStartedResponseDto
  })
  @Post('seed')
  @HttpCode(HttpStatus.ACCEPTED)
  async startSeed(@Body() dto: StartSeedDto): Promise<JobStartedResponseDto> {
    // Fire-and-forget: trả về jobId ngay, job chạy ở background
    const jobId = await this.demoService.startSeedJob({
      numCustomers: dto.numCustomers ?? 100,
      minOrders: dto.minOrders ?? 20,
      maxOrders: dto.maxOrders ?? 50
    })
    return {
      jobId,
      message: `Job seed đã được khởi động. Poll GET /demo/jobs/${jobId}`
    }
  }

  // ─── POST /demo/load-test ─────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Khởi động job load test trên campaign đang ACTIVE (background)'
  })
  @ApiBody({ type: StartLoadTestDto })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description:
      'Job load test đã được khởi động, dùng GET /demo/jobs/:jobId để theo dõi',
    type: JobStartedResponseDto
  })
  @Post('load-test')
  @HttpCode(HttpStatus.ACCEPTED)
  async startLoadTest(
    @Body() dto: StartLoadTestDto
  ): Promise<JobStartedResponseDto> {
    const jobId = await this.demoService.startLoadTestJob({
      campaignId: dto.campaignId,
      autoDetect: dto.autoDetect ?? true,
      concurrency: dto.concurrency ?? 20,
      totalRequests: dto.totalRequests ?? 100,
      delayMs: dto.delayMs ?? 0,
      resetCounters: dto.resetCounters ?? true
    })
    return {
      jobId,
      message: `Job load test đã được khởi động. Poll GET /demo/jobs/${jobId}`
    }
  }

  // ─── GET /demo/jobs/:jobId ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy trạng thái job theo jobId' })
  @ApiParam({
    name: 'jobId',
    description: 'ID của job cần theo dõi',
    example: 'demo-seed-abc12345'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trạng thái job hiện tại',
    type: JobStatusDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy job (có thể đã hết TTL 2 giờ)'
  })
  @Get('jobs/:jobId')
  @HttpCode(HttpStatus.OK)
  async getJobStatus(@Param('jobId') jobId: string): Promise<JobStatusDto> {
    const state = await this.demoService.getJobStatus(jobId)
    if (!state) {
      throw new NotFoundException(
        `Không tìm thấy job "${jobId}". Job có thể đã hết hạn (TTL 2 giờ).`
      )
    }
    return {
      jobId: state.jobId,
      status: state.status,
      progress: state.progress,
      currentStep: state.currentStep,
      result: state.result,
      error: state.error,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt
    }
  }

  // ─── DELETE /demo/cleanup ─────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Xóa toàn bộ dữ liệu lịch sử do demo seed tạo ra' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đã xóa xong, trả về số lượng records đã xóa'
  })
  @Delete('cleanup')
  @HttpCode(HttpStatus.OK)
  async cleanup(): Promise<Record<string, unknown>> {
    return this.demoService.cleanupHistoricalData()
  }
}
