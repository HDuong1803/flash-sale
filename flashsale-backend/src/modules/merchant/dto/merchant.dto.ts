import { ApiProperty } from '@nestjs/swagger'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  MaxLength,
  Matches
} from 'class-validator'
import { OrderStatus } from '@prisma/client'

// ─── Revenue DTOs ─────────────────────────────────────────────────────────────

export class MerchantRevenuePeriodDto {
  @ApiProperty({
    required: false,
    example: '2026-01-01',
    description: 'Ngày bắt đầu (YYYY-MM-DD). Mặc định: 30 ngày trước'
  })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiProperty({
    required: false,
    example: '2026-03-31',
    description: 'Ngày kết thúc (YYYY-MM-DD). Mặc định: hôm nay'
  })
  @IsOptional()
  @IsDateString()
  endDate?: string
}

export class MerchantRevenueSummaryDto {
  @ApiProperty({
    example: 50000000,
    description: 'Tổng doanh thu toàn thời gian'
  })
  totalRevenue: number
  @ApiProperty({ example: 12000000, description: 'Doanh thu trong kỳ' })
  revenueThisPeriod: number
  @ApiProperty({ example: 9000000, description: 'Doanh thu kỳ trước' })
  revenuePreviousPeriod: number
  @ApiProperty({ example: 33.3, description: 'Tăng trưởng so kỳ trước (%)' })
  growthRate: number
  @ApiProperty({ example: 45, description: 'Tổng đơn hàng trong kỳ' })
  totalOrders: number
  @ApiProperty({ example: 38, description: 'Đơn hoàn thành' })
  successOrders: number
  @ApiProperty({ example: 7, description: 'Đơn đã huỷ' })
  cancelledOrders: number
  @ApiProperty({ example: 315789, description: 'Giá trị trung bình mỗi đơn' })
  avgOrderValue: number
}

export class MerchantRevenueDailyDto {
  @ApiProperty({ example: '2026-03-01' }) date: string
  @ApiProperty({ example: 1500000 }) revenue: number
  @ApiProperty({ example: 5 }) orders: number
}

export class MerchantRevenueByCampaignDto {
  @ApiProperty({ example: 'uuid' }) campaignId: string
  @ApiProperty({ example: 'Flash Sale Mỹ Phẩm T3' }) campaignName: string
  @ApiProperty({
    example: 'ENDED',
    enum: ['DRAFT', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'ENDED']
  })
  campaignStatus: string
  @ApiProperty({ example: 8000000 }) revenue: number
  @ApiProperty({ example: 25 }) orders: number
}

export class MerchantRevenueTopProductDto {
  @ApiProperty({ example: 'uuid' }) productId: string
  @ApiProperty({ example: 'Son môi Dior Rouge 999' }) productName: string
  @ApiProperty({ example: 4500000 }) revenue: number
  @ApiProperty({ example: 5 }) quantity: number
}

export class MerchantRevenueResponseDto {
  @ApiProperty({ type: MerchantRevenueSummaryDto })
  summary: MerchantRevenueSummaryDto
  @ApiProperty({ type: [MerchantRevenueDailyDto] })
  dailyRevenue: MerchantRevenueDailyDto[]
  @ApiProperty({ type: [MerchantRevenueByCampaignDto] })
  byCampaign: MerchantRevenueByCampaignDto[]
  @ApiProperty({ type: [MerchantRevenueTopProductDto] })
  topProducts: MerchantRevenueTopProductDto[]
}

export class ApplyMerchantDto {
  @ApiProperty({ description: 'Tên doanh nghiệp', example: 'Cửa hàng ABC' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  businessName: string

  @ApiProperty({
    description: 'Mã số thuế (10-13 chữ số)',
    example: '0312345678'
  })
  @IsString()
  @Matches(/^\d{10,13}$/, { message: 'Mã số thuế phải có 10-13 chữ số' })
  taxCode: string

  @ApiProperty({
    description: 'Mô tả ngắn',
    example: 'Chuyên kinh doanh đồ điện tử',
    required: false
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string

  @ApiProperty({ description: 'Số điện thoại', example: '0901234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string

  @ApiProperty({
    description: 'Địa chỉ kinh doanh',
    example: '123 Nguyễn Huệ, Q.1, TP.HCM'
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string
}

export class MerchantProfileResponseDto {
  @ApiProperty({ example: 'uuid' }) id: string
  @ApiProperty({ example: 'uuid' }) userId: string
  @ApiProperty({ example: 'Cửa hàng ABC' }) businessName: string
  @ApiProperty({ example: '0312345678' }) taxCode: string
  @ApiProperty({
    example: 'PENDING',
    enum: ['PENDING', 'APPROVED', 'REJECTED']
  })
  kycStatus: string
  @ApiProperty({ required: false, nullable: true }) rejectionReason:
    | string
    | null
  @ApiProperty({ required: false, nullable: true }) approvedAt: Date | null
  @ApiProperty() createdAt: Date
  @ApiProperty() updatedAt: Date
}

export class MerchantStatsResponseDto {
  @ApiProperty({ example: 5200000, description: 'Doanh thu hôm nay (VND)' })
  revenueToday: number
  @ApiProperty({ example: 2 }) activeCampaigns: number
  @ApiProperty({ example: 15 }) ordersToday: number
  @ApiProperty({ example: 68.5, description: 'Tỷ lệ chuyển đổi (%)' })
  conversionRate: number
}

export class MerchantOrderQueryDto {
  @ApiProperty({
    required: false,
    enum: OrderStatus
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus

  @ApiProperty({ required: false, default: 1, example: 1 })
  @IsOptional()
  page?: number

  @ApiProperty({ required: false, default: 10, example: 10 })
  @IsOptional()
  limit?: number
}
