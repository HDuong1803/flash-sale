import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator'

export class CheckoutDto {
  @ApiProperty({
    description: 'ID reservation (nhận từ GET /orders/result/:requestId)',
    example: 'uuid'
  })
  @IsUUID()
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
    enum: ['VNPAY', 'MOMO', 'STRIPE'],
    example: 'STRIPE'
  })
  @IsIn(['VNPAY', 'MOMO', 'STRIPE'])
  paymentMethod: string
}

export class CheckoutResponseDto {
  @ApiProperty({
    example: 'https://payment.example.com?paymentId=uuid&method=STRIPE'
  })
  paymentUrl: string

  @ApiProperty({ example: 'uuid' })
  paymentId: string
}
