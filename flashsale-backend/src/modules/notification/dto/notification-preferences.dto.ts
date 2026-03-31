import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsOptional } from 'class-validator'

export class NotificationPreferencesResponseDto {
  @ApiProperty({
    description: 'Master toggle cho toàn bộ thông báo',
    example: true
  })
  notificationsEnabled: boolean

  @ApiProperty({ description: 'Nhắc nhở chiến dịch đã đăng ký', example: true })
  campaignReminderEnabled: boolean

  @ApiProperty({ description: 'Cập nhật trạng thái đơn hàng', example: true })
  orderStatusEnabled: boolean
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({
    description: 'Master toggle cho toàn bộ thông báo',
    required: false,
    example: true
  })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean

  @ApiProperty({
    description: 'Nhắc nhở chiến dịch đã đăng ký',
    required: false,
    example: true
  })
  @IsOptional()
  @IsBoolean()
  campaignReminderEnabled?: boolean

  @ApiProperty({
    description: 'Cập nhật trạng thái đơn hàng',
    required: false,
    example: true
  })
  @IsOptional()
  @IsBoolean()
  orderStatusEnabled?: boolean
}
