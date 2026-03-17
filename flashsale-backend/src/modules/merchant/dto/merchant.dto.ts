import { ApiProperty } from '@nestjs/swagger'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
  Matches
} from 'class-validator'
import { OrderStatus } from '@prisma/client'

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
