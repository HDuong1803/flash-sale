import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNumber, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { PaymentStatus } from '@prisma/client'

export class PaymentWebhookDto {
  @ApiProperty({ description: 'ID thanh toán', example: 'uuid' })
  @IsString()
  paymentId: string

  @ApiProperty({
    description: 'Mã giao dịch từ cổng thanh toán',
    example: 'TXN001'
  })
  @IsString()
  transactionId: string

  @ApiProperty({
    description: 'Kết quả thanh toán',
    enum: ['success', 'failed']
  })
  @IsIn(['success', 'failed'])
  status: string

  @ApiProperty({
    description: 'Số tiền thực thanh toán (VND)',
    example: 24990000
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number
}

export class WebhookResponseDto {
  @ApiProperty({ example: true }) received: boolean
}

export class PaymentStatusResponseDto {
  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.PENDING })
  status: PaymentStatus

  @ApiProperty({ example: 'uuid', nullable: true })
  orderId: string | null
}
