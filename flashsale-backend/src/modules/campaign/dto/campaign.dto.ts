import { ApiProperty } from '@nestjs/swagger'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsISO8601,
  IsUUID,
  Min,
  MaxLength,
  IsIn
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateCampaignDto {
  @ApiProperty({
    description: 'Tên chiến dịch',
    example: 'Flash Sale iPhone 15',
    maxLength: 100
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @ApiProperty({
    description: 'Mô tả chiến dịch',
    example: 'Giảm giá sốc 30%',
    required: false
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string

  @ApiProperty({
    description: 'Thời gian bắt đầu (ISO8601)',
    example: '2026-04-01T20:00:00Z'
  })
  @IsISO8601()
  startTime: string

  @ApiProperty({
    description: 'Thời gian kết thúc (ISO8601)',
    example: '2026-04-01T22:00:00Z'
  })
  @IsISO8601()
  endTime: string
}

export class UpdateCampaignDto {
  @ApiProperty({ description: 'Tên chiến dịch', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string

  @ApiProperty({ description: 'Mô tả chiến dịch', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string

  @ApiProperty({ description: 'Thời gian bắt đầu (ISO8601)', required: false })
  @IsISO8601()
  @IsOptional()
  startTime?: string

  @ApiProperty({ description: 'Thời gian kết thúc (ISO8601)', required: false })
  @IsISO8601()
  @IsOptional()
  endTime?: string
}

export class AddCampaignProductDto {
  @ApiProperty({ description: 'ID sản phẩm', example: 'uuid' })
  @IsUUID()
  productId: string

  @ApiProperty({ description: 'Giá sale (VND)', example: 24990000 })
  @IsNumber()
  @Min(1000)
  @Type(() => Number)
  salePrice: number

  @ApiProperty({ description: 'Số lượng flash sale', example: 50 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  saleQuantity: number

  @ApiProperty({ description: 'Giới hạn mua mỗi user', example: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  perUserLimit: number
}

export class CampaignQueryDto {
  @ApiProperty({
    description: 'Lọc theo trạng thái',
    enum: ['DRAFT', 'APPROVED', 'ACTIVE', 'ENDED'],
    required: false
  })
  @IsString()
  @IsOptional()
  @IsIn(['DRAFT', 'APPROVED', 'ACTIVE', 'ENDED'])
  status?: string

  @ApiProperty({ description: 'Tìm kiếm theo tên', required: false })
  @IsString()
  @IsOptional()
  search?: string

  @ApiProperty({ required: false, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number

  @ApiProperty({ required: false, default: 12, example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number
}

export class CampaignResponseDto {
  @ApiProperty({ example: 'uuid' }) id: string
  @ApiProperty({ example: 'uuid' }) merchantId: string
  @ApiProperty({ example: 'Flash Sale iPhone 15' }) name: string
  @ApiProperty({ required: false, nullable: true }) description: string | null
  @ApiProperty({
    example: 'DRAFT',
    enum: ['DRAFT', 'APPROVED', 'ACTIVE', 'ENDED']
  })
  status: string
  @ApiProperty({ example: '2026-04-01T20:00:00Z' }) startTime: Date
  @ApiProperty({ example: '2026-04-01T22:00:00Z' }) endTime: Date
  @ApiProperty() createdAt: Date
  @ApiProperty() updatedAt: Date
}

export class CampaignProductResponseDto {
  @ApiProperty({ example: 'uuid' }) id: string
  @ApiProperty({ example: 'uuid' }) campaignId: string
  @ApiProperty({ example: 'uuid' }) productId: string
  @ApiProperty({ example: 24990000 }) salePrice: number
  @ApiProperty({ example: 50 }) saleQuantity: number
  @ApiProperty({ example: 50 }) remainingQuantity: number
  @ApiProperty({ example: 1 }) perUserLimit: number
  @ApiProperty() createdAt: Date
}

export class CampaignReportResponseDto {
  @ApiProperty({ example: 45 }) totalOrders: number
  @ApiProperty({ example: 42 }) successOrders: number
  @ApiProperty({ example: 3 }) cancelledOrders: number
  @ApiProperty({ example: 1049580000, description: 'Tổng doanh thu (VND)' })
  totalRevenue: number
  @ApiProperty({ example: 84.0, description: 'Tỷ lệ chuyển đổi (%)' })
  conversionRate: number
}
