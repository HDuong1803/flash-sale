import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator'
import { PriceAction, PricingStrategy } from '@prisma/client'

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class CreatePricingRuleDto {
  @ApiProperty({
    description: 'Tên rule để dễ nhận biết',
    example: 'Giảm giá khi sắp hết hàng'
  })
  @IsString()
  name: string

  @ApiProperty({ description: 'Loại strategy', enum: PricingStrategy })
  @IsEnum(PricingStrategy)
  strategy: PricingStrategy

  @ApiProperty({
    description: 'Độ ưu tiên (cao hơn chạy trước)',
    example: 10,
    default: 0
  })
  @IsInt()
  @IsOptional()
  priority?: number = 0

  @ApiPropertyOptional({
    description: 'Tỉ lệ stock thấp để kích hoạt (STOCK_BASED)',
    example: 0.2
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  stockRatioLow?: number

  @ApiPropertyOptional({
    description: 'Tỉ lệ stock cao để kích hoạt (STOCK_BASED)',
    example: 0.8
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  stockRatioHigh?: number

  @ApiPropertyOptional({
    description: 'Hành động khi stock trigger',
    enum: PriceAction
  })
  @IsEnum(PriceAction)
  @IsOptional()
  stockAction?: PriceAction

  @ApiPropertyOptional({
    description: 'Velocity tối thiểu (đơn/phút) để kích hoạt',
    example: 5
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  velocityMin?: number

  @ApiPropertyOptional({
    description: 'Velocity tối đa để kích hoạt',
    example: 1
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  velocityMax?: number

  @ApiPropertyOptional({
    description: 'Hành động khi velocity trigger',
    enum: PriceAction
  })
  @IsEnum(PriceAction)
  @IsOptional()
  velocityAction?: PriceAction

  @ApiPropertyOptional({
    description: 'Phút còn lại để kích hoạt (TIME_BASED)',
    example: 30
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  minutesBeforeEnd?: number

  @ApiPropertyOptional({
    description: 'Hành động khi time trigger',
    enum: PriceAction
  })
  @IsEnum(PriceAction)
  @IsOptional()
  timeAction?: PriceAction

  @ApiProperty({ description: 'Phần trăm điều chỉnh (5.0 = 5%)', example: 5.0 })
  @IsNumber()
  @Min(0.1)
  @Max(50)
  adjustmentPct: number

  @ApiProperty({ description: 'Giá sàn tối thiểu (VNĐ)', example: 100000 })
  @IsNumber()
  @Min(0)
  minPrice: number

  @ApiProperty({ description: 'Giá trần tối đa (VNĐ)', example: 5000000 })
  @IsNumber()
  @Min(0)
  maxPrice: number
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class PricingRuleResponseDto {
  @ApiProperty() id: string
  @ApiProperty() campaignProductId: string
  @ApiProperty() name: string
  @ApiProperty({ enum: PricingStrategy }) strategy: PricingStrategy
  @ApiProperty() priority: number
  @ApiProperty() isActive: boolean
  @ApiPropertyOptional() stockRatioLow: number | null
  @ApiPropertyOptional() stockRatioHigh: number | null
  @ApiPropertyOptional({ enum: PriceAction }) stockAction: PriceAction | null
  @ApiPropertyOptional() velocityMin: number | null
  @ApiPropertyOptional() velocityMax: number | null
  @ApiPropertyOptional({ enum: PriceAction }) velocityAction: PriceAction | null
  @ApiPropertyOptional() minutesBeforeEnd: number | null
  @ApiPropertyOptional({ enum: PriceAction }) timeAction: PriceAction | null
  @ApiProperty() adjustmentPct: number
  @ApiProperty() minPrice: number
  @ApiProperty() maxPrice: number
  @ApiProperty() createdAt: Date
  @ApiProperty() updatedAt: Date
}

export class PriceHistoryResponseDto {
  @ApiProperty() id: string
  @ApiProperty() oldPrice: number
  @ApiProperty() newPrice: number
  @ApiProperty() changePct: number
  @ApiProperty() reason: string
  @ApiProperty() triggeredBy: string
  @ApiProperty() stockAtChange: number
  @ApiProperty() velocityAtChange: number
  @ApiProperty() timeRemainingMin: number
  @ApiProperty() createdAt: Date
}
