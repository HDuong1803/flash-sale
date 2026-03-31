import { ApiProperty } from '@nestjs/swagger'
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  MinLength,
  Matches
} from 'class-validator'

/**
 * DTO for the change-password flow (not yet wired to a route — reserved for future use).
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: 'Mật khẩu hiện tại',
    example: 'currentPassword123',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  currentPassword: string

  @ApiProperty({
    description: 'Mật khẩu mới (tối thiểu 8 ký tự)',
    example: 'newPassword456',
    required: true,
    minLength: 8
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(100)
  newPassword: string
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Email cần xác minh',
    example: 'user@example.com',
    required: true
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string

  @ApiProperty({
    description: 'Mã OTP 6 chữ số',
    example: '123456',
    required: true
  })
  @IsString()
  @Length(6, 6, { message: 'Mã OTP phải có đúng 6 chữ số' })
  otp: string
}

export class ResendOtpDto {
  @ApiProperty({
    description: 'Email cần gửi lại OTP',
    example: 'user@example.com',
    required: true
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string
}

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email tài khoản cần đặt lại mật khẩu',
    example: 'user@example.com',
    required: true
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Email tài khoản',
    example: 'user@example.com',
    required: true
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string

  @ApiProperty({
    description: 'Mã OTP 6 chữ số được gửi qua email',
    example: '481923',
    required: true
  })
  @IsString()
  @Length(6, 6, { message: 'Mã OTP phải có đúng 6 chữ số' })
  otp: string

  @ApiProperty({
    description: 'Mật khẩu mới (tối thiểu 8 ký tự, phải có ít nhất 1 số)',
    example: 'newPass123',
    required: true,
    minLength: 8
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(100)
  @Matches(/\d/, { message: 'Mật khẩu phải có ít nhất 1 số' })
  newPassword: string
}
