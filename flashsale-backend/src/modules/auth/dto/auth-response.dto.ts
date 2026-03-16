import { ApiProperty } from '@nestjs/swagger'

export class AuthUserDto {
  @ApiProperty({ description: 'User ID', example: 'cmmsy8iyj0000q084hxjjjaub' })
  id: string

  @ApiProperty({ description: 'Địa chỉ email', example: 'user@example.com' })
  email: string

  @ApiProperty({ description: 'Họ và tên', example: 'Nguyễn Văn An' })
  fullName: string

  @ApiProperty({
    description: 'Vai trò',
    example: 'CUSTOMER',
    enum: ['CUSTOMER', 'MERCHANT', 'ADMIN']
  })
  role: string

  @ApiProperty({
    description: 'Ảnh đại diện',
    example: 'https://example.com/avatar.jpg',
    required: false,
    nullable: true
  })
  avatarUrl?: string
}

/**
 * Tokens are delivered via HttpOnly cookies — NOT in the response body.
 * The body only carries the user object so the client can hydrate its UI state.
 */
export class AuthResponseDto {
  @ApiProperty({ type: () => AuthUserDto, description: 'Thông tin người dùng' })
  user: AuthUserDto
}
