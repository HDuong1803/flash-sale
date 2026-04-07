import { ApiProperty } from '@nestjs/swagger'
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min
} from 'class-validator'
import { Type } from 'class-transformer'
import { OrderStatus } from '@prisma/client'

export class PurchaseDto {
  @ApiProperty({ description: 'ID sản phẩm trong chiến dịch', example: 'cuid' })
  @IsString()
  @IsNotEmpty()
  campaignProductId: string

  @ApiProperty({ description: 'Số lượng muốn mua', example: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number
}

export class OrderQueryDto {
  @ApiProperty({
    description: 'Lọc theo trạng thái',
    enum: OrderStatus,
    required: false
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus

  @ApiProperty({ required: false, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number

  @ApiProperty({ required: false, default: 10, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number
}

export class PurchaseResponseDto {
  @ApiProperty({
    example: 'cuid',
    description: 'ID yêu cầu để truy vấn kết quả'
  })
  requestId: string
}

export class PurchaseResultResponseDto {
  @ApiProperty({
    example: 'PROCESSING',
    enum: ['PROCESSING', 'RESERVED', 'SOLD_OUT'],
    description: 'Trạng thái xử lý đơn hàng'
  })
  status: string

  @ApiProperty({ required: false, nullable: true, example: 'cuid' })
  reservationId?: string

  @ApiProperty({
    required: false,
    nullable: true,
    example: '2026-04-01T20:10:00Z'
  })
  expiredAt?: string

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Sản phẩm đã hết hàng'
  })
  reason?: string
}

export class OrderResponseDto {
  @ApiProperty({ example: 'cuid' }) id: string
  @ApiProperty({ example: 'cuid' }) customerId: string
  @ApiProperty({ example: 'cuid' }) merchantId: string
  @ApiProperty({
    example: 'CONFIRMED',
    enum: OrderStatus
  })
  status: OrderStatus
  @ApiProperty({ example: 24990000, description: 'Tổng tiền (VND)' })
  totalAmount: number
  @ApiProperty({ example: '123 Nguyễn Huệ, Q.1' }) shippingAddress: string
  @ApiProperty() createdAt: Date
  @ApiProperty() updatedAt: Date
}
