import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator'
import { Transform } from 'class-transformer'
import { LockStrategy } from '@prisma/client'

// ─── Async benchmark types ────────────────────────────────────────────────────

export type StrategyMode = 'NO_LOCK' | 'DB_LOCK' | 'REDIS_LUA' | 'ALL'
export type BenchmarkRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class RunBenchmarkDto {
  @ApiProperty({
    description:
      'ID của CampaignProduct dùng để test (stock sẽ bị reset tạm thời)',
    example: 'cld8a1b2c3d4e5f6'
  })
  @IsString()
  campaignProductId: string

  @ApiProperty({
    description: 'Số lượng concurrent requests để mô phỏng (tối đa 10,000)',
    example: 100,
    minimum: 1,
    maximum: 10000
  })
  @IsInt()
  @Min(1)
  @Max(10000)
  concurrentUsers: number

  @ApiProperty({
    description: 'Số lượng stock để reset trước khi chạy test',
    example: 50,
    minimum: 1
  })
  @IsInt()
  @Min(1)
  stockAmount: number

  @ApiProperty({
    description: 'Strategy cần test',
    enum: LockStrategy,
    example: LockStrategy.REDIS_LUA
  })
  @IsEnum(LockStrategy)
  strategy: LockStrategy
}

export class RunAllBenchmarkDto {
  @ApiProperty({
    description: 'ID của CampaignProduct dùng để test',
    example: 'cld8a1b2c3d4e5f6'
  })
  @IsString()
  campaignProductId: string

  @ApiProperty({
    description:
      'Số lượng concurrent requests cho mỗi strategy (tối đa 10,000)',
    example: 200,
    minimum: 1,
    maximum: 10000
  })
  @IsInt()
  @Min(1)
  @Max(10000)
  concurrentUsers: number

  @ApiProperty({
    description: 'Số lượng stock cho mỗi lần test',
    example: 100,
    minimum: 1
  })
  @IsInt()
  @Min(1)
  stockAmount: number
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class BenchmarkResultDto {
  @ApiProperty({ description: 'Strategy được test', enum: LockStrategy })
  strategy: LockStrategy

  @ApiProperty({ description: 'Số concurrent users mô phỏng', example: 200 })
  concurrentUsers: number

  @ApiProperty({ description: 'Stock ban đầu', example: 100 })
  stockAmount: number

  @ApiProperty({ description: 'Số lần mua thành công', example: 100 })
  succeeded: number

  @ApiProperty({ description: 'Số lần mua thất bại (hết hàng)', example: 100 })
  failed: number

  @ApiProperty({ description: 'Số lần lỗi hệ thống', example: 0 })
  errors: number

  @ApiProperty({ description: 'Số lần oversell phát hiện được', example: 0 })
  oversellCount: number

  @ApiProperty({ description: 'Stock cuối cùng trong Redis', example: 0 })
  finalStock: number | null

  @ApiProperty({ description: 'Stock kỳ vọng sau test', example: 0 })
  expectedFinalStock: number

  @ApiProperty({
    description: 'Test pass: không có oversell và stock hợp lệ',
    example: true
  })
  isCorrect: boolean

  @ApiProperty({ description: 'Tổng thời gian chạy (ms)', example: 1234 })
  totalTimeMs: number

  @ApiProperty({
    description: 'Throughput (requests per second)',
    example: 6500
  })
  throughputRPS: number

  @ApiProperty({ description: 'Latency trung bình (ms)', example: 15 })
  avgLatencyMs: number

  @ApiProperty({ description: 'P50 latency (ms)', example: 12 })
  p50LatencyMs: number

  @ApiProperty({ description: 'P95 latency (ms)', example: 45 })
  p95LatencyMs: number

  @ApiProperty({ description: 'P99 latency (ms)', example: 120 })
  p99LatencyMs: number
}

export class BenchmarkComparisonDto {
  @ApiProperty({ type: BenchmarkResultDto })
  noLock: BenchmarkResultDto

  @ApiProperty({ type: BenchmarkResultDto })
  dbLock: BenchmarkResultDto

  @ApiProperty({ type: BenchmarkResultDto })
  redisLua: BenchmarkResultDto

  @ApiProperty({
    description: 'Strategy được khuyến nghị',
    example: 'REDIS_LUA'
  })
  recommendation: string

  @ApiProperty({
    description: 'Kết luận tự động từ kết quả',
    example: 'Redis Lua là lựa chọn tối ưu...'
  })
  conclusion: string
}

// ─── Async Benchmark DTOs ─────────────────────────────────────────────────────

export class StartBenchmarkDto {
  @ApiProperty({
    description: 'ID của CampaignProduct dùng để test',
    example: 'cld8a1b2c3d4e5f6'
  })
  @IsString()
  campaignProductId: string

  @ApiProperty({
    description: 'Số lượng concurrent requests để mô phỏng (tối đa 10,000)',
    example: 100,
    minimum: 1,
    maximum: 10000
  })
  @IsInt()
  @Min(1)
  @Max(10000)
  concurrentUsers: number

  @ApiProperty({
    description: 'Số lượng stock để reset trước khi chạy test',
    example: 50,
    minimum: 1
  })
  @IsInt()
  @Min(1)
  stockAmount: number

  @ApiProperty({
    description: 'Strategy cần test hoặc ALL để so sánh cả 3',
    enum: ['NO_LOCK', 'DB_LOCK', 'REDIS_LUA', 'ALL'],
    example: 'REDIS_LUA'
  })
  @IsIn(['NO_LOCK', 'DB_LOCK', 'REDIS_LUA', 'ALL'])
  strategyMode: StrategyMode
}

export class BenchmarkRunDto {
  @ApiProperty({ description: 'Run ID', example: 'cm...' })
  id: string

  @ApiProperty({ description: 'Campaign Product ID' })
  campaignProductId: string

  @ApiProperty({ description: 'Số concurrent users' })
  concurrentUsers: number

  @ApiProperty({ description: 'Stock amount' })
  stockAmount: number

  @ApiProperty({ enum: ['NO_LOCK', 'DB_LOCK', 'REDIS_LUA', 'ALL'] })
  strategyMode: StrategyMode

  @ApiProperty({ enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] })
  status: BenchmarkRunStatus

  @ApiPropertyOptional({
    description: 'Kết quả benchmark (null khi chưa hoàn thành)'
  })
  result: BenchmarkResultDto | BenchmarkComparisonDto | null

  @ApiPropertyOptional({ description: 'Error message nếu thất bại' })
  errorMessage: string | null

  @ApiProperty({ description: 'Thời điểm tạo' })
  createdAt: string

  @ApiPropertyOptional({ description: 'Thời điểm hoàn thành' })
  completedAt: string | null
}

export class BenchmarkHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Số trang',
    example: 1,
    minimum: 1,
    default: 1
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? parseInt(String(value), 10) : 1
  )
  page?: number = 1

  @ApiPropertyOptional({
    description: 'Số records mỗi trang',
    example: 20,
    minimum: 1,
    maximum: 50,
    default: 20
  })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined ? parseInt(String(value), 10) : 20
  )
  limit?: number = 20
}

export class StockAuditQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo product ID' })
  @IsString()
  @IsOptional()
  productId?: string

  @ApiPropertyOptional({
    description: 'Chỉ lấy oversell events',
    example: true
  })
  @Transform(({ value }) => {
    if (value === undefined) return undefined
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return false
    return value
  })
  @IsBoolean()
  @IsOptional()
  isOversell?: boolean

  @ApiPropertyOptional({ description: 'Lọc theo strategy', enum: LockStrategy })
  @IsEnum(LockStrategy)
  @IsOptional()
  strategy?: LockStrategy

  @ApiPropertyOptional({ description: 'Số trang', example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number

  @ApiPropertyOptional({
    description: 'Số records mỗi trang',
    example: 50,
    minimum: 1,
    maximum: 200
  })
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number
}
