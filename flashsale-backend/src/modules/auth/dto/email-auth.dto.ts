import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'

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
