import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator'
import { Type } from 'class-transformer'
import { PaymentStatus } from '@prisma/client'

/**
 * Payload SePay gửi khi phát hiện giao dịch ngân hàng khớp với tài khoản của merchant.
 * Ref: https://docs.sepay.vn/webhook-tu-dong.html
 */
export class SepayWebhookDto {
  @ApiProperty({ description: 'ID giao dịch SePay', example: 12345 })
  @IsNumber()
  @Type(() => Number)
  id: number

  @ApiProperty({ description: 'Tên ngân hàng', example: 'MB Bank' })
  @IsString()
  gateway: string

  @ApiProperty({
    description: 'Thời gian giao dịch (YYYY-MM-DD HH:mm:ss)',
    example: '2026-03-23 14:30:00'
  })
  @IsString()
  transactionDate: string

  @ApiProperty({ description: 'Số tài khoản nhận', example: '12345678' })
  @IsString()
  accountNumber: string

  @ApiProperty({
    description: 'Order code SePay tự động trích xuất từ nội dung',
    example: 'clx123abc',
    nullable: true,
    required: false
  })
  @IsOptional()
  @IsString()
  code: string | null

  @ApiProperty({
    description: 'Nội dung chuyển khoản đầy đủ',
    example: 'FlashSale clx123abc'
  })
  @IsString()
  content: string

  @ApiProperty({
    description: 'Loại giao dịch',
    enum: ['in', 'out'],
    example: 'in'
  })
  @IsIn(['in', 'out'])
  transferType: 'in' | 'out'

  @ApiProperty({ description: 'Số tiền giao dịch (VND)', example: 299000 })
  @IsNumber()
  @Type(() => Number)
  transferAmount: number

  @ApiProperty({ description: 'Số dư lũy kế', example: 5000000 })
  @IsNumber()
  @Type(() => Number)
  accumulated: number

  @ApiProperty({
    description: 'Tài khoản phụ',
    nullable: true,
    required: false
  })
  @IsOptional()
  @IsString()
  subAccount: string | null

  @ApiProperty({
    description: 'Mã tham chiếu SePay (dùng làm transactionId)',
    example: 'SEPAY12345'
  })
  @IsString()
  referenceCode: string

  @ApiProperty({ description: 'Mô tả thêm từ SePay', example: '' })
  @IsString()
  description: string
}

export class SepayWebhookResponseDto {
  @ApiProperty({ example: true })
  success: boolean
}

/**
 * Response cho GET /payments/:paymentId/status
 * Frontend dùng để polling mỗi vài giây.
 */
export class PaymentStatusResponseDto {
  @ApiProperty({
    enum: PaymentStatus,
    example: PaymentStatus.PENDING,
    description:
      'Trạng thái thanh toán. ' +
      'PENDING = chờ chuyển khoản, ' +
      'SUCCESS = đã xác nhận, ' +
      'FAILED = thất bại'
  })
  status: PaymentStatus

  @ApiProperty({
    example: 'clx1a2b3c4d5e',
    nullable: true,
    required: false,
    description: 'ID đơn hàng — chỉ có khi trạng thái = SUCCESS'
  })
  orderId: string | null
}
