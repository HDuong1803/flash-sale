import { ApiProperty } from '@nestjs/swagger'
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator'
import { Type } from 'class-transformer'
import { FulfillmentStatus } from '@prisma/client'

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class BookLabelDto {
  @ApiProperty({
    description: 'Cân nặng kiện hàng (gram)',
    example: 500,
    required: false
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(70_000) // max 70kg
  @Type(() => Number)
  weightGrams?: number

  @ApiProperty({
    description: 'Kích thước kiện hàng (cm)',
    example: { l: 30, w: 20, h: 10 },
    required: false
  })
  @IsOptional()
  dimensionsCm?: { l: number; w: number; h: number }
}

export class CreateFulfillmentRuleDto {
  @ApiProperty({
    description: 'Tên rule',
    example: 'USPS — Lightweight Domestic'
  })
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({
    description: 'Độ ưu tiên (cao hơn = đánh giá trước)',
    example: 100
  })
  @IsInt()
  @Min(0)
  @Max(1000)
  @Type(() => Number)
  priority: number

  @ApiProperty({
    description: 'Cân nặng tối thiểu (gram)',
    required: false,
    example: 0
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  minWeightGrams?: number

  @ApiProperty({
    description: 'Cân nặng tối đa (gram)',
    required: false,
    example: 450
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxWeightGrams?: number

  @ApiProperty({
    description: 'Tổng đơn hàng tối thiểu (cents USD)',
    required: false,
    example: 0
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  minOrderCents?: number

  @ApiProperty({
    description: 'Tổng đơn hàng tối đa (cents USD)',
    required: false,
    example: 50000
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  maxOrderCents?: number

  @ApiProperty({
    description: 'Country code đích (ISO 3166-1 alpha-2)',
    required: false,
    example: 'US'
  })
  @IsOptional()
  @IsString()
  destCountry?: string

  @ApiProperty({
    description: 'State code đích (US states)',
    required: false,
    example: 'CA'
  })
  @IsOptional()
  @IsString()
  destState?: string

  @ApiProperty({
    description: 'ID của carrier',
    example: 'cjld2cjxh0000qzrmn831i7rn'
  })
  @IsString()
  @IsNotEmpty()
  carrierId: string

  @ApiProperty({ description: 'SLA cam kết (giờ)', example: 72 })
  @IsInt()
  @Min(1)
  @Max(720) // max 30 days
  @Type(() => Number)
  slaHours: number
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class TrackingEventResponseDto {
  @ApiProperty({ description: 'ID tracking event' })
  id: string

  @ApiProperty({ description: 'Carrier status (raw)' })
  carrierStatus: string

  @ApiProperty({ description: 'Mô tả event', required: false })
  description?: string | null

  @ApiProperty({ description: 'Địa điểm', required: false })
  location?: string | null

  @ApiProperty({ description: 'Thời điểm xảy ra' })
  occurredAt: string
}

export class FulfillmentOrderResponseDto {
  @ApiProperty({ description: 'ID fulfillment order' })
  id: string

  @ApiProperty({ description: 'ID order' })
  orderId: string

  @ApiProperty({
    description: 'Trạng thái fulfillment',
    enum: FulfillmentStatus
  })
  fulfillStatus: FulfillmentStatus

  @ApiProperty({ description: 'Carrier được chọn', required: false })
  carrier?: { code: string; displayName: string } | null

  @ApiProperty({ description: 'Tracking number', required: false })
  trackingNumber?: string | null

  @ApiProperty({ description: 'URL theo dõi đơn hàng', required: false })
  trackingUrl?: string | null

  @ApiProperty({ description: 'URL label giao hàng', required: false })
  labelUrl?: string | null

  @ApiProperty({ description: 'URL label PDF', required: false })
  labelPdfUrl?: string | null

  @ApiProperty({ description: 'SLA deadline', required: false })
  slaDeadline?: string | null

  @ApiProperty({ description: 'SLA bị vi phạm không' })
  slaBreached: boolean

  @ApiProperty({ description: 'Chi phí label (cents)', required: false })
  labelCostCents?: number | null

  @ApiProperty({ description: 'Địa chỉ đã normalize', required: false })
  normalizedAddress?: object | null

  @ApiProperty({
    description: 'Lịch sử tracking events',
    type: [TrackingEventResponseDto]
  })
  trackingEvents: TrackingEventResponseDto[]
}

export class FulfillmentRuleResponseDto {
  @ApiProperty({ description: 'ID rule' })
  id: string

  @ApiProperty({ description: 'Tên rule' })
  name: string

  @ApiProperty({ description: 'Độ ưu tiên' })
  priority: number

  @ApiProperty({ description: 'Cân nặng tối thiểu (gram)', required: false })
  minWeightGrams?: number | null

  @ApiProperty({ description: 'Cân nặng tối đa (gram)', required: false })
  maxWeightGrams?: number | null

  @ApiProperty({ description: 'Tổng đơn tối thiểu (cents)', required: false })
  minOrderCents?: number | null

  @ApiProperty({ description: 'Tổng đơn tối đa (cents)', required: false })
  maxOrderCents?: number | null

  @ApiProperty({ description: 'Country đích', required: false })
  destCountry?: string | null

  @ApiProperty({ description: 'State đích', required: false })
  destState?: string | null

  @ApiProperty({ description: 'Carrier được assign' })
  carrier: { id: string; code: string; displayName: string }

  @ApiProperty({ description: 'SLA cam kết (giờ)' })
  slaHours: number

  @ApiProperty({ description: 'Rule đang active không' })
  active: boolean
}

export class CarrierResponseDto {
  @ApiProperty({ description: 'ID carrier' })
  id: string

  @ApiProperty({ description: 'Carrier code (USPS, UPS, FEDEX)' })
  code: string

  @ApiProperty({ description: 'Tên hiển thị' })
  displayName: string

  @ApiProperty({ description: 'Logo URL', required: false })
  logoUrl?: string | null

  @ApiProperty({ description: 'Đang sandbox mode không' })
  sandboxMode: boolean

  @ApiProperty({ description: 'Carrier đang active không' })
  active: boolean
}

export class ToggleCarrierDto {
  @ApiProperty({ description: 'Active hay không' })
  @IsBoolean()
  active: boolean
}

// ─── Pending QC ───────────────────────────────────────────────────────────────

class PendingQcOrderInfoDto {
  @ApiProperty({ description: 'Tổng giá trị đơn (USD)' })
  totalAmount: number

  @ApiProperty({ description: 'Thời điểm tạo đơn' })
  createdAt: string

  @ApiProperty({ description: 'Số lượng sản phẩm trong đơn' })
  itemCount: number
}

class PendingQcInspectorDto {
  @ApiProperty() id: string
  @ApiProperty() email: string
  @ApiProperty({ required: false }) fullName: string | null
}

export class PendingQcOrderResponseDto {
  @ApiProperty({ description: 'ID đơn hàng' })
  orderId: string

  @ApiProperty({
    description: 'Trạng thái fulfillment',
    enum: FulfillmentStatus
  })
  fulfillStatus: FulfillmentStatus

  @ApiProperty({ description: 'SLA deadline', required: false })
  slaDeadline: string | null

  @ApiProperty({ description: 'SLA đã bị vi phạm' })
  slaBreached: boolean

  @ApiProperty({ description: 'Carrier được assign', required: false })
  carrier: { code: string; displayName: string } | null

  @ApiProperty({
    description: 'Trạng thái QC checkpoint (null = chưa tạo)',
    required: false
  })
  qcStatus: string | null

  @ApiProperty({
    description: 'Inspector đang xử lý QC',
    required: false,
    type: PendingQcInspectorDto
  })
  qcInspector: PendingQcInspectorDto | null

  @ApiProperty({
    description: 'Thông tin đơn hàng',
    type: PendingQcOrderInfoDto
  })
  order: PendingQcOrderInfoDto
}
