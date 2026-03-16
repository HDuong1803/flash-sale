import { ApiProperty } from '@nestjs/swagger'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
  IsUrl
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateProductDto {
  @ApiProperty({ description: 'Tên sản phẩm', example: 'iPhone 15 Pro Max' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string

  @ApiProperty({ description: 'Mô tả sản phẩm', required: false })
  @IsString()
  @IsOptional()
  description?: string

  @ApiProperty({
    description: 'Danh mục',
    example: 'Điện thoại',
    required: false
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string

  @ApiProperty({ description: 'Giá gốc (VND)', example: 34990000 })
  @IsNumber()
  @Min(1000)
  @Type(() => Number)
  originalPrice: number

  @ApiProperty({ description: 'URL hình ảnh', required: false })
  @IsUrl()
  @IsOptional()
  imageUrl?: string

  @ApiProperty({ description: 'Tồn kho ban đầu', example: 100 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  inventory: number
}

export class UpdateProductDto {
  @ApiProperty({ description: 'Tên sản phẩm', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string

  @ApiProperty({ description: 'Mô tả', required: false })
  @IsString()
  @IsOptional()
  description?: string

  @ApiProperty({ description: 'Danh mục', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string

  @ApiProperty({ description: 'Giá gốc (VND)', required: false })
  @IsNumber()
  @Min(1000)
  @IsOptional()
  @Type(() => Number)
  originalPrice?: number

  @ApiProperty({ description: 'URL hình ảnh', required: false })
  @IsUrl()
  @IsOptional()
  imageUrl?: string
}

export class ProductQueryDto {
  @ApiProperty({ description: 'Tìm kiếm theo tên', required: false })
  @IsString()
  @IsOptional()
  search?: string

  @ApiProperty({
    description: 'Lọc theo trạng thái',
    enum: ['ACTIVE', 'INACTIVE'],
    required: false
  })
  @IsString()
  @IsOptional()
  status?: string

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number
}

export class ProductResponseDto {
  @ApiProperty({ example: 'uuid' }) id: string
  @ApiProperty({ example: 'uuid' }) merchantId: string
  @ApiProperty({ example: 'iPhone 15 Pro Max' }) name: string
  @ApiProperty({ required: false, nullable: true }) description: string | null
  @ApiProperty({ required: false, nullable: true }) category: string | null
  @ApiProperty({ example: 34990000 }) originalPrice: number
  @ApiProperty({ required: false, nullable: true }) imageUrl: string | null
  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  status: string
  @ApiProperty() createdAt: Date
}

export class InventoryResponseDto {
  @ApiProperty({ example: 'uuid' }) productId: string
  @ApiProperty({ example: 100, description: 'Tổng tồn kho' }) quantity: number
  @ApiProperty({ example: 5, description: 'Đang giữ chỗ' }) reserved: number
  @ApiProperty({ example: 95, description: 'Khả dụng (quantity - reserved)' })
  available: number
}
