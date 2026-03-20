import { ApiProperty } from '@nestjs/swagger'

export class UserResponseDto {
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
    description: 'Trạng thái tài khoản',
    example: 'ACTIVE',
    enum: ['ACTIVE', 'INACTIVE', 'BANNED']
  })
  status: string

  @ApiProperty({
    description: 'URL ảnh đại diện (từ IPFS)',
    example: 'https://gateway.pinata.cloud/ipfs/Qm...',
    required: false,
    nullable: true
  })
  avatarUrl?: string | null

  @ApiProperty({
    description: 'Lần đăng nhập cuối',
    example: '2026-03-16T08:00:00.000Z',
    type: 'string',
    format: 'date-time',
    required: false,
    nullable: true
  })
  lastLoginAt?: Date | null

  @ApiProperty({
    description: 'Ngày tạo tài khoản',
    example: '2026-01-01T00:00:00.000Z',
    type: 'string',
    format: 'date-time'
  })
  createdAt: Date

  @ApiProperty({
    description: 'Thông tin merchant (nếu có)',
    required: false,
    nullable: true
  })
  merchantProfile?: object | null

  @ApiProperty({
    description: 'Thông tin khách hàng (nếu có)',
    required: false,
    nullable: true
  })
  customerProfile?: object | null
}
