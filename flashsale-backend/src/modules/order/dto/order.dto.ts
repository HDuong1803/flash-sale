import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class PurchaseDto {
  @ApiProperty({ description: 'ID sản phẩm trong chiến dịch', example: 'uuid' })
  @IsUUID()
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
    enum: ['PENDING', 'CONFIRMED', 'SHIPPING', 'DONE', 'CANCELLED'],
    required: false
  })
  @IsOptional()
  @IsString()
  status?: string

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
  @ApiProperty({ example: 'uuid', description: 'Request ID để poll kết quả' })
  requestId: string
}

export class PurchaseResultResponseDto {
  @ApiProperty({
    example: 'PROCESSING',
    enum: ['PROCESSING', 'RESERVED', 'SOLD_OUT'],
    description: 'Trạng thái xử lý đơn hàng'
  })
  status: string

  @ApiProperty({ required: false, nullable: true, example: 'uuid' })
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
  @ApiProperty({ example: 'uuid' }) id: string
  @ApiProperty({ example: 'uuid' }) customerId: string
  @ApiProperty({ example: 'uuid' }) merchantId: string
  @ApiProperty({
    example: 'CONFIRMED',
    enum: ['PENDING', 'CONFIRMED', 'SHIPPING', 'DONE', 'CANCELLED']
  })
  status: string
  @ApiProperty({ example: 24990000, description: 'Tổng tiền (VND)' })
  totalAmount: number
  @ApiProperty({ example: '123 Nguyễn Huệ, Q.1' }) shippingAddress: string
  @ApiProperty() createdAt: Date
  @ApiProperty() updatedAt: Date
}
