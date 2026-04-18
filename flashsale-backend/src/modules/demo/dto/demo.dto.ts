import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

// ─── Request DTOs ──────────────────────────────────────────────────────────────

export class StartSeedDto {
  @ApiProperty({
    description: 'Số lượng customers sẽ tạo (mặc định 100)',
    example: 100,
    required: false
  })
  @IsInt()
  @Min(10)
  @Max(500)
  @IsOptional()
  numCustomers?: number = 100

  @ApiProperty({
    description: 'Số đơn hàng tối thiểu mỗi CampaignProduct (mặc định 20)',
    example: 20,
    required: false
  })
  @IsInt()
  @Min(5)
  @Max(200)
  @IsOptional()
  minOrders?: number = 20

  @ApiProperty({
    description: 'Số đơn hàng tối đa mỗi CampaignProduct (mặc định 50)',
    example: 50,
    required: false
  })
  @IsInt()
  @Min(5)
  @Max(200)
  @IsOptional()
  maxOrders?: number = 50
}

export class StartLoadTestDto {
  @ApiProperty({
    description: 'ID của campaign đang ACTIVE cần test',
    example: 'clxxxxxx',
    required: true
  })
  @IsString()
  campaignId!: string

  @ApiProperty({
    description: 'Số users đồng thời gửi request mỗi đợt (mặc định 20)',
    example: 20,
    required: false
  })
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  concurrency?: number = 20

  @ApiProperty({
    description: 'Tổng số request sẽ gửi (mặc định 100)',
    example: 100,
    required: false
  })
  @IsInt()
  @Min(10)
  @Max(2000)
  @IsOptional()
  totalRequests?: number = 100
}

// ─── Response DTOs ─────────────────────────────────────────────────────────────

export class JobStartedResponseDto {
  @ApiProperty({
    description: 'ID của background job',
    example: 'demo-job-xxxx'
  })
  jobId!: string

  @ApiProperty({ description: 'Thông báo', example: 'Job đã được khởi động' })
  message!: string
}

export class JobStatusDto {
  @ApiProperty({ description: 'ID job' })
  jobId!: string

  @ApiProperty({
    description: 'Trạng thái job',
    enum: ['pending', 'running', 'completed', 'failed']
  })
  status!: string

  @ApiProperty({ description: 'Phần trăm hoàn thành (0-100)', example: 45 })
  progress!: number

  @ApiProperty({ description: 'Bước hiện tại đang xử lý', required: false })
  currentStep?: string

  @ApiProperty({ description: 'Kết quả khi job hoàn thành', required: false })
  result?: Record<string, unknown>

  @ApiProperty({ description: 'Lỗi khi job thất bại', required: false })
  error?: string

  @ApiProperty({ description: 'Thời điểm bắt đầu' })
  startedAt!: string

  @ApiProperty({ description: 'Thời điểm kết thúc (nếu có)', required: false })
  finishedAt?: string
}

// ─── Internal job state (lưu trong Redis) ────────────────────────────────────

export interface DemoJobState {
  jobId: string
  type: 'seed' | 'load-test'
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  currentStep?: string
  result?: Record<string, unknown>
  error?: string
  startedAt: string
  finishedAt?: string
}
