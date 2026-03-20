import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateProfileDto {
  @ApiProperty({
    description: 'Họ và tên đầy đủ',
    example: 'Nguyễn Văn An',
    required: false
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string

  @ApiProperty({
    description: 'Số điện thoại',
    example: '0912345678',
    required: false
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string

  @ApiProperty({
    description: 'Địa chỉ giao hàng mặc định',
    example: '123 Đường Lê Lợi, Quận 1, TP.HCM',
    required: false
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  defaultAddress?: string
}
