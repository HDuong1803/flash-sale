import { ApiProperty } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from 'class-validator'
import { Type } from 'class-transformer'
import { QcStatus } from '@prisma/client'

// ─── Sub-DTOs ─────────────────────────────────────────────────────────────────

export class QcChecklistItemDto {
  @ApiProperty({
    description: 'Key định danh checklist item',
    example: 'item_count'
  })
  @IsString()
  @IsNotEmpty()
  key: string

  @ApiProperty({
    description: 'Label hiển thị',
    example: 'Số lượng sản phẩm đúng'
  })
  @IsString()
  @IsNotEmpty()
  label: string

  @ApiProperty({
    description: 'Kết quả kiểm tra (null = chưa kiểm tra)',
    example: true,
    required: false,
    nullable: true
  })
  @IsOptional()
  @IsBoolean()
  passed: boolean | null
}

export class DimensionsCmDto {
  @ApiProperty({ description: 'Chiều dài (cm)', example: 30 })
  @IsInt()
  @Min(1)
  @Max(200)
  l: number

  @ApiProperty({ description: 'Chiều rộng (cm)', example: 20 })
  @IsInt()
  @Min(1)
  @Max(200)
  w: number

  @ApiProperty({ description: 'Chiều cao (cm)', example: 10 })
  @IsInt()
  @Min(1)
  @Max(200)
  h: number
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class CreateQcCheckpointDto {
  @ApiProperty({
    description: 'Checklist items tùy chỉnh (nếu không truyền sẽ dùng default)',
    type: [QcChecklistItemDto],
    required: false
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QcChecklistItemDto)
  checklist?: QcChecklistItemDto[]
}

export class QcPassDto {
  @ApiProperty({
    description: 'Tất cả checklist items — tất cả phải passed=true',
    type: [QcChecklistItemDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QcChecklistItemDto)
  checklist: QcChecklistItemDto[]

  @ApiProperty({ description: 'Ghi chú thêm', required: false })
  @IsOptional()
  @IsString()
  notes?: string

  @ApiProperty({
    description: 'URLs ảnh kiểm tra (upload trước rồi gửi URL)',
    type: [String],
    required: false
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[]

  @ApiProperty({
    description: 'Cân nặng thực tế (gram)',
    example: 450,
    required: false
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(70_000)
  @Type(() => Number)
  weightGrams?: number

  @ApiProperty({
    description: 'Kích thước thực tế (cm)',
    type: DimensionsCmDto,
    required: false
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DimensionsCmDto)
  dimensionsCm?: DimensionsCmDto
}

export class QcFailDto {
  @ApiProperty({
    description: 'Lý do không đạt QC',
    example: 'Sản phẩm bị vỡ, cần đóng gói lại'
  })
  @IsString()
  @IsNotEmpty()
  failReason: string

  @ApiProperty({
    description: 'Checklist items đã kiểm tra',
    type: [QcChecklistItemDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QcChecklistItemDto)
  checklist: QcChecklistItemDto[]

  @ApiProperty({ description: 'Ghi chú thêm', required: false })
  @IsOptional()
  @IsString()
  notes?: string

  @ApiProperty({
    description: 'URLs ảnh minh chứng',
    type: [String],
    required: false
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[]
}

export class QcReworkDto {
  @ApiProperty({
    description: 'Ghi chú rework',
    required: false,
    example: 'Đã thay hộp mới, chuyển lại QC'
  })
  @IsOptional()
  @IsString()
  note?: string
}

// ─── Query DTOs ───────────────────────────────────────────────────────────────

export class QcListQueryDto {
  @ApiProperty({
    description: 'Lọc theo status',
    enum: QcStatus,
    required: false
  })
  @IsOptional()
  @IsIn(Object.values(QcStatus))
  status?: QcStatus

  @ApiProperty({
    description: 'Số lượng kết quả',
    example: 20,
    required: false
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number

  @ApiProperty({
    description: 'Offset phân trang',
    example: 0,
    required: false
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class QcChecklistItemResponseDto {
  @ApiProperty({ description: 'Key định danh' })
  key: string

  @ApiProperty({ description: 'Label hiển thị' })
  label: string

  @ApiProperty({ description: 'Kết quả kiểm tra', nullable: true })
  passed: boolean | null
}

export class QcCheckpointResponseDto {
  @ApiProperty({ description: 'ID QC checkpoint' })
  id: string

  @ApiProperty({ description: 'ID đơn hàng' })
  orderId: string

  @ApiProperty({ description: 'Trạng thái QC', enum: QcStatus })
  status: QcStatus

  @ApiProperty({
    description: 'Thông tin inspector',
    type: Object,
    nullable: true
  })
  inspector: {
    id: string
    email: string
    fullName: string | null
  } | null

  @ApiProperty({
    description: 'Danh sách checklist',
    type: [QcChecklistItemResponseDto]
  })
  checklist: QcChecklistItemResponseDto[]

  @ApiProperty({
    description: 'Lý do không đạt QC',
    required: false,
    nullable: true
  })
  failReason: string | null

  @ApiProperty({ description: 'Ghi chú', required: false, nullable: true })
  notes: string | null

  @ApiProperty({
    description: 'URLs ảnh kiểm tra',
    type: [String]
  })
  photoUrls: string[]

  @ApiProperty({
    description: 'Thời điểm QC pass',
    required: false,
    nullable: true
  })
  passedAt: string | null

  @ApiProperty({
    description: 'Thời điểm QC fail',
    required: false,
    nullable: true
  })
  failedAt: string | null

  @ApiProperty({ description: 'Thời điểm tạo' })
  createdAt: string
}

export class QcListResponseDto {
  @ApiProperty({ type: [QcCheckpointResponseDto] })
  items: QcCheckpointResponseDto[]

  @ApiProperty({ description: 'Tổng số bản ghi' })
  total: number
}
