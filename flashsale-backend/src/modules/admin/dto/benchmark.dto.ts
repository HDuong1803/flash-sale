import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator'
import { Transform } from 'class-transformer'
import { LockStrategy } from '@prisma/client'

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
    description: 'Số lượng concurrent requests để mô phỏng',
    example: 100,
    minimum: 10,
    maximum: 2000
  })
  @IsInt()
  @Min(10)
  @Max(2000)
  concurrentUsers: number

  @ApiProperty({
    description: 'Số lượng stock để reset trước khi chạy test',
    example: 50,
    minimum: 1,
    maximum: 1000
  })
  @IsInt()
  @Min(1)
  @Max(1000)
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
    description: 'Số lượng concurrent requests cho mỗi strategy',
    example: 200,
    minimum: 10,
    maximum: 1000
  })
  @IsInt()
  @Min(10)
  @Max(1000)
  concurrentUsers: number

  @ApiProperty({
    description: 'Số lượng stock cho mỗi lần test',
    example: 100,
    minimum: 1,
    maximum: 500
  })
  @IsInt()
  @Min(1)
  @Max(500)
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
