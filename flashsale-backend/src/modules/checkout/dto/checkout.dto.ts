import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsString } from 'class-validator'
import { PaymentMethod } from '@prisma/client'

export class CheckoutDto {
  @ApiProperty({
    description: 'ID giữ chỗ (nhận từ GET /orders/result/:requestId)',
    example: 'cuid'
  })
  @IsString()
  @IsNotEmpty()
  reservationId: string

  @ApiProperty({
    description: 'Địa chỉ giao hàng',
    example: '123 Nguyễn Huệ, Q.1, TP.HCM'
  })
  @IsString()
  @IsNotEmpty()
  shippingAddress: string

  @ApiProperty({
    description: 'Phương thức thanh toán',
    enum: PaymentMethod,
    example: PaymentMethod.STRIPE
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod
}

export class CheckoutResponseDto {
  @ApiProperty({
    example: 'https://payment.example.com?paymentId=uuid&method=STRIPE'
  })
  paymentUrl: string

  @ApiProperty({ example: 'cuid' })
  paymentId: string
}
