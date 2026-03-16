import { ApiProperty } from '@nestjs/swagger'
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator'

export class RegisterDto {
  @ApiProperty({
    description: 'Họ và tên đầy đủ',
    example: 'Nguyễn Văn An',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string

  @ApiProperty({
    description: 'Địa chỉ email',
    example: 'user@example.com',
    required: true
  })
  @IsEmail()
  @MaxLength(255)
  email: string

  @ApiProperty({
    description: 'Mật khẩu (tối thiểu 8 ký tự)',
    example: 'password123',
    required: true,
    minLength: 8
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string
}
