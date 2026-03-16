import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsString } from 'class-validator'

export class LoginDto {
  @ApiProperty({
    description: 'Địa chỉ email',
    example: 'user@example.com',
    required: true
  })
  @IsEmail()
  email: string

  @ApiProperty({
    description: 'Mật khẩu',
    example: 'password123',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  password: string
}
