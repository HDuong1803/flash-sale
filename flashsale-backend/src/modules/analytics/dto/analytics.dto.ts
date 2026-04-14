import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { FunnelStep } from '@prisma/client'
import {
  IsEnum,
  IsOptional,
  IsString,
  IsObject,
  IsIP,
  MaxLength
} from 'class-validator'

// ─── Request DTOs ──────────────────────────────────────────────────────────────

export class TrackFunnelEventDto {
  @ApiProperty({
    description: 'Session ID (anonymous browser session)',
    example: 'sess_abc123def456'
  })
  @IsString()
  @MaxLength(128)
  sessionId: string

  @ApiProperty({
    description: 'Campaign ID',
    example: 'cmpr123abc'
  })
  @IsString()
  campaignId: string

  @ApiProperty({
    description: 'Funnel step being tracked',
    enum: FunnelStep,
    example: FunnelStep.PRODUCT_CLICK
  })
  @IsEnum(FunnelStep)
  step: FunnelStep

  @ApiPropertyOptional({
    description: 'Authenticated user ID (omit for anonymous)',
    example: 'usr_xyz789'
  })
  @IsOptional()
  @IsString()
  userId?: string

  @ApiPropertyOptional({
    description: 'Additional metadata (product ID, page URL, etc.)',
    example: { productId: 'prod_123', pageUrl: '/campaigns/abc' }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

// ─── Response DTOs ─────────────────────────────────────────────────────────────

export class FunnelStepDto {
  @ApiProperty({
    description: 'Funnel step name',
    enum: FunnelStep
  })
  step: FunnelStep

  @ApiProperty({
    description: 'Total event count at this step',
    example: 1250
  })
  count: number

  @ApiProperty({
    description: 'Conversion rate relative to top-of-funnel (0-100)',
    example: 42
  })
  conversionRate: number

  @ApiProperty({
    description: 'Drop-off rate from previous step (0-100)',
    example: 18
  })
  dropoffRate: number
}

export class HeatmapHourDto {
  @ApiProperty({
    description: 'Hour of day (0-23)',
    example: 14
  })
  hour: number

  @ApiProperty({
    description: 'Number of successful payments in that hour',
    example: 87
  })
  count: number
}

export class SnapshotResponseDto {
  @ApiProperty({
    description: 'Snapshot timestamp',
    example: '2026-04-14T08:00:00.000Z'
  })
  snapshotAt: Date

  @ApiProperty({ description: 'Remaining stock', example: 150 })
  stockRemaining: number

  @ApiProperty({ description: 'Stock ratio (0-1)', example: 0.75 })
  stockRatio: number

  @ApiProperty({ description: 'Total purchases', example: 50 })
  purchaseCount: number

  @ApiProperty({ description: 'Total revenue', example: 5000000 })
  revenue: number

  @ApiProperty({
    description: 'Conversion rate (purchases / views)',
    example: 0.12
  })
  conversionRate: number

  @ApiProperty({ description: 'Purchases in last 5 min window', example: 8 })
  purchasesLast5m: number

  @ApiProperty({
    description: 'Revenue per minute (last 5 min)',
    example: 160000
  })
  revenueVelocity: number
}

export class StockoutPredictionResponseDto {
  @ApiProperty({ description: 'Campaign product ID' })
  campaignProductId: string

  @ApiProperty({ description: 'Current stock level', example: 47 })
  currentStock: number

  @ApiPropertyOptional({
    description: 'Minutes until stockout (null if no stockout predicted)',
    example: 38
  })
  stockoutMinutes: number | null

  @ApiPropertyOptional({
    description: 'Predicted stockout timestamp',
    example: '2026-04-14T09:38:00.000Z'
  })
  stockoutAt: Date | null

  @ApiProperty({
    description: 'Prediction confidence (R² of linear regression, 0-1)',
    example: 0.87
  })
  confidence: number

  @ApiProperty({
    description: 'Stock trend',
    enum: ['STABLE', 'DECLINING', 'ACCELERATING', 'SOLD_OUT'],
    example: 'DECLINING'
  })
  trend: string

  @ApiProperty({
    description: 'Number of data points used in prediction',
    example: 12
  })
  dataPoints: number

  @ApiProperty({
    description: 'Average stock consumed per minute',
    example: 1.25
  })
  velocityPerMinute: number
}

export class CampaignOverviewResponseDto {
  @ApiProperty({ description: 'Snapshot timestamp' })
  snapshotAt: Date

  @ApiProperty({ description: 'Remaining stock', example: 120 })
  stockRemaining: number

  @ApiProperty({ description: 'Total stock', example: 200 })
  stockTotal: number

  @ApiProperty({ description: 'Stock ratio (0-1)', example: 0.6 })
  stockRatio: number

  @ApiProperty({ description: 'Total purchases', example: 80 })
  purchaseCount: number

  @ApiProperty({ description: 'Total revenue', example: 8000000 })
  revenue: number

  @ApiProperty({ description: 'Conversion rate', example: 0.15 })
  conversionRate: number

  @ApiProperty({ description: 'Total views', example: 533 })
  viewCount: number

  @ApiProperty({ description: 'Total clicks', example: 210 })
  clickCount: number

  @ApiProperty({ description: 'Total purchase attempts', example: 95 })
  attemptCount: number

  @ApiProperty({ description: 'Purchases in last 5 min', example: 5 })
  purchasesLast5m: number

  @ApiProperty({ description: 'Revenue velocity (per min)', example: 133333 })
  revenueVelocity: number
}

export class TimeSeriesQueryDto {
  @ApiPropertyOptional({
    description: 'Number of snapshots to return (max 288)',
    example: 48
  })
  @IsOptional()
  limit?: number
}

export class IpDto {
  @ApiProperty({
    description: 'IP address to look up',
    example: '203.0.113.42'
  })
  @IsIP()
  ip: string
}
