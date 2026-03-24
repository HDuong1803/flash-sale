import { ApiProperty } from '@nestjs/swagger'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsEnum,
  Min,
  MaxLength
} from 'class-validator'
import { Type } from 'class-transformer'
import { ProductStatus } from '@prisma/client'

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
}

export class ProductQueryDto {
  @ApiProperty({ description: 'Tìm kiếm theo tên', required: false })
  @IsString()
  @IsOptional()
  search?: string

  @ApiProperty({
    description: 'Lọc theo trạng thái',
    enum: ProductStatus,
    required: false
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus

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

export class ProductImageDto {
  @ApiProperty({ example: 'clxyz123', description: 'ProductImage ID (dùng để xoá)' })
  id: string

  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
    description: 'URL ảnh (Cloudinary CDN)'
  })
  url: string

  @ApiProperty({ example: true, description: 'Ảnh chính (hiển thị trong listing)' })
  isPrimary: boolean

  @ApiProperty({ example: 0, description: 'Thứ tự sắp xếp (0 = đầu tiên)' })
  sortOrder: number
}

export class ProductResponseDto {
  @ApiProperty({ example: 'clxyz123', description: 'Product ID' })
  id: string

  @ApiProperty({ example: 'clmerchant1', description: 'Merchant ID' })
  merchantId: string

  @ApiProperty({ example: 'iPhone 15 Pro Max' })
  name: string

  @ApiProperty({ required: false, nullable: true })
  description: string | null

  @ApiProperty({ required: false, nullable: true })
  category: string | null

  @ApiProperty({ example: 34990000 })
  originalPrice: number

  @ApiProperty({
    description: 'URL ảnh chính (Cloudinary CDN) — null nếu chưa có ảnh',
    required: false,
    nullable: true
  })
  imageUrl: string | null

  @ApiProperty({
    description: 'Danh sách ảnh với ID để xoá từng ảnh riêng lẻ',
    type: [ProductImageDto]
  })
  images: ProductImageDto[]

  @ApiProperty({
    description: 'Danh sách URL tất cả ảnh (tối đa 10, sắp xếp theo thứ tự)',
    type: [String],
    example: ['https://res.cloudinary.com/demo/image/upload/v1/sample.jpg']
  })
  imageUrls: string[]

  @ApiProperty({ example: 'ACTIVE', enum: ProductStatus })
  status: ProductStatus

  @ApiProperty({ example: 95, description: 'Số lượng tồn kho khả dụng' })
  inventory: number

  @ApiProperty()
  createdAt: Date
}

export class ProductCampaignSummaryDto {
  @ApiProperty({ example: 'clcampaign1' }) id: string
  @ApiProperty({ example: 'Flash Sale Tết 2025' }) name: string
  @ApiProperty({ example: 'ACTIVE' }) status: string
  @ApiProperty() startTime: Date
  @ApiProperty() endTime: Date
  @ApiProperty({ example: 24990000, description: 'Giá bán trong chiến dịch' }) salePrice: number
}

export class ProductDetailResponseDto extends ProductResponseDto {
  @ApiProperty({ type: [ProductCampaignSummaryDto], description: 'Các chiến dịch đã/đang sử dụng sản phẩm này' })
  campaigns: ProductCampaignSummaryDto[]
}

export class InventoryResponseDto {
  @ApiProperty({ example: 'uuid' }) productId: string
  @ApiProperty({ example: 100, description: 'Tổng tồn kho' }) quantity: number
  @ApiProperty({ example: 5, description: 'Đang giữ chỗ' }) reserved: number
  @ApiProperty({ example: 95, description: 'Khả dụng (quantity - reserved)' })
  available: number
}
