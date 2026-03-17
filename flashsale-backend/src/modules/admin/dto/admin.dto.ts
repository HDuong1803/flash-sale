import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, IsInt, IsEnum } from 'class-validator'
import { Type } from 'class-transformer'
import { CampaignStatus, KycStatus, UserRole } from '@common/enums/prisma-enums'

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
