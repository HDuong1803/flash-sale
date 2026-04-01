import { ApiProperty } from '@nestjs/swagger'
import {
  IsOptional,
  IsString,
  IsInt,
  IsEnum,
  IsISO8601,
  Min,
  MaxLength,
  IsBoolean,
  IsObject
} from 'class-validator'
import { Type } from 'class-transformer'
import { CampaignStatus, KycStatus, UserRole } from '@common/enums/prisma-enums'
import { PaymentMethod } from '@prisma/client'

export class AdminMerchantQueryDto {
  @ApiProperty({
    description: 'Lọc theo trạng thái KYC',
    enum: KycStatus,
    required: false
  })
  @IsOptional()
  @IsEnum(KycStatus)
  status?: KycStatus
}

export class AdminCampaignQueryDto {
  @ApiProperty({
    description: 'Lọc theo trạng thái',
    enum: CampaignStatus,
    required: false
  })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus
}

export class AdminUserQueryDto {
  @ApiProperty({
    description: 'Lọc theo role',
    enum: UserRole,
    required: false
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole

  @ApiProperty({ description: 'Tìm kiếm theo email hoặc tên', required: false })
  @IsOptional()
  @IsString()
  search?: string

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number
}

export class RejectReasonDto {
  @ApiProperty({ description: 'Lý do từ chối', example: 'Hồ sơ không đầy đủ' })
  @IsString()
  reason: string
}

export class AdminStatsResponseDto {
  @ApiProperty({ example: 1250 }) totalUsers: number
  @ApiProperty({ example: 42 }) activeMerchants: number
  @ApiProperty({ example: 3 }) liveCampaigns: number
  @ApiProperty({ example: 87 }) ordersToday: number
  @ApiProperty({ example: 2174430000, description: 'Doanh thu hôm nay (VND)' })
  revenueToday: number
  @ApiProperty({ example: 2 }) failedJobs: number
}

export class OrdersByHourItemDto {
  @ApiProperty({ example: '14:00' }) hour: string
  @ApiProperty({ example: 23 }) orders: number
}

export class OrdersByTimeQueryDto {
  @ApiProperty({
    description: 'Start datetime (ISO 8601)',
    example: '2026-03-17T00:00:00.000Z'
  })
  @IsISO8601()
  start: string

  @ApiProperty({
    description: 'End datetime (ISO 8601)',
    example: '2026-03-17T23:59:59.999Z'
  })
  @IsISO8601()
  end: string
}

export class RevenueTrendItemDto {
  @ApiProperty({ example: '10/03' }) date: string
  @ApiProperty({ example: 5240000 }) revenue: number
}

export class ActivityItemDto {
  @ApiProperty({ example: 'ORDER' }) type: string
  @ApiProperty({ example: 'Đơn hàng mới từ Nguyễn Văn An' }) message: string
  @ApiProperty() createdAt: Date
}

export class DlqJobResponseDto {
  @ApiProperty({ example: 'uuid' }) id: string
  @ApiProperty({ example: 'ORDER_PROCESSING' }) type: string
  @ApiProperty({ example: 3 }) retryCount: number
  @ApiProperty({ example: 'Redis timeout' }) errorMessage: string
  @ApiProperty() failedAt: Date
}

export class SystemHealthResponseDto {
  @ApiProperty({ example: 'UP', enum: ['UP', 'DOWN'] }) postgres: string
  @ApiProperty({ example: 'UP', enum: ['UP', 'DOWN'] }) redis: string
  @ApiProperty({ example: 'UP', enum: ['UP', 'DOWN'] }) rabbitmq: string
  @ApiProperty({ example: 'UP' }) api: string
}

export class QueueStatsResponseDto {
  @ApiProperty({ example: 0 }) high: number
  @ApiProperty({ example: 5 }) normal: number
}

export class ForceRescheduleDto {
  @ApiProperty({
    description: 'Số phút từ bây giờ đến khi chiến dịch bắt đầu (tối thiểu 15)',
    example: 30,
    required: true
  })
  @IsInt()
  @Min(15)
  offsetMinutes: number

  @ApiProperty({
    description: 'Lý do thay đổi lịch',
    example: 'Điều chỉnh để phù hợp với campaign marketing',
    required: false
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string
}

export class RescheduleRequestQueryDto {
  @ApiProperty({
    description: 'Lọc theo trạng thái',
    enum: [
      'PENDING_MERCHANT',
      'PENDING_ADMIN',
      'APPLIED',
      'REJECTED',
      'EXPIRED'
    ],
    required: false
  })
  @IsString()
  @IsOptional()
  status?: string

  @ApiProperty({
    description: 'Lọc theo loại yêu cầu',
    enum: ['ADMIN_FORCE', 'MERCHANT_REQUEST'],
    required: false
  })
  @IsString()
  @IsOptional()
  requestType?: string

  @ApiProperty({ description: 'Lọc theo ID chiến dịch', required: false })
  @IsString()
  @IsOptional()
  campaignId?: string
}

export class FinanceDashboardSummaryDto {
  @ApiProperty({ example: 125000000, description: 'Tổng doanh thu gộp của các đơn có hoa hồng' })
  grossRevenue: number
  @ApiProperty({ example: 9800000, description: 'Tổng doanh thu hoa hồng admin thu được' })
  commissionRevenue: number
  @ApiProperty({ example: 115200000, description: 'Tổng tiền ròng thuộc merchant' })
  merchantNetRevenue: number
  @ApiProperty({ example: 7.84, description: 'Tỷ lệ hoa hồng trung bình (%)' })
  averageCommissionRatePct: number
  @ApiProperty({ example: 242, description: 'Số đơn đã ghi nhận hoa hồng' })
  totalCommissionOrders: number
}

export class FinanceTrendItemDto {
  @ApiProperty({ example: '01/04' }) date: string
  @ApiProperty({ example: 1500000 }) commissionRevenue: number
  @ApiProperty({ example: 22000000 }) grossRevenue: number
}

export class CommissionCategoryBreakdownDto {
  @ApiProperty({ example: 'cmcat_electronics' }) categoryId: string
  @ApiProperty({ example: 'ELECTRONICS' }) code: string
  @ApiProperty({ example: 'Điện tử' }) name: string
  @ApiProperty({ example: 0.06 }) defaultRate: number
  @ApiProperty({ example: 3200000 }) commissionRevenue: number
  @ApiProperty({ example: 54000000 }) grossRevenue: number
  @ApiProperty({ example: 69 }) orders: number
}

export class PaymentGatewayConfigDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.SEPAY })
  gateway: PaymentMethod

  @ApiProperty({ example: 'SePay QR Transfer' })
  displayName: string

  @ApiProperty({ example: true })
  enabled: boolean

  @ApiProperty({ example: true })
  isDefault: boolean

  @ApiProperty({
    required: false,
    example: { bankCode: 'MB', bankAccount: '123456789', accountName: 'FLASH SALE' }
  })
  config: Record<string, unknown> | null
}

export class UpdatePaymentGatewayConfigDto {
  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean

  @ApiProperty({ required: false, example: 'Stripe Checkout' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string

  @ApiProperty({
    required: false,
    example: { stripeSecretKey: 'sk_test_***' }
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown> | null
}

export class CampaignMonitorQueryDto {
  @ApiProperty({ required: false, description: 'ID campaign để lọc monitor' })
  @IsOptional()
  @IsString()
  campaignId?: string

  @ApiProperty({
    required: false,
    description: 'Khoảng thời gian lùi lại (phút)',
    default: 60
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  minutes?: number
}

export class CampaignMonitorTimelineQueryDto extends CampaignMonitorQueryDto {
  @ApiProperty({
    required: false,
    description: 'Kích thước bucket theo phút',
    default: 5
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bucketMinutes?: number
}

export class CampaignMonitorOverviewDto {
  @ApiProperty({ example: 1240 }) visits: number
  @ApiProperty({ example: 621 }) uniqueVisitors: number
  @ApiProperty({ example: 284 }) reservations: number
  @ApiProperty({ example: 132 }) successfulPayments: number
  @ApiProperty({ example: 46.48 }) reservationToPaymentRatePct: number
  @ApiProperty({ example: 3.27 }) avgCheckoutLatencySeconds: number
  @ApiProperty({ example: 2.1 }) peakActionsPerSecond: number
  @ApiProperty({ example: 18.5 }) volatilityIndex: number
  @ApiProperty({ example: 12 }) queueDepth: number
  @ApiProperty({ example: 3 }) failedJobsLastHour: number
}

export class CampaignMonitorTimelineItemDto {
  @ApiProperty({ example: '2026-04-01T15:30:00.000Z' }) bucket: string
  @ApiProperty({ example: 130 }) visits: number
  @ApiProperty({ example: 42 }) reservations: number
  @ApiProperty({ example: 19 }) successfulPayments: number
  @ApiProperty({ example: 45.23 }) successRatePct: number
}
