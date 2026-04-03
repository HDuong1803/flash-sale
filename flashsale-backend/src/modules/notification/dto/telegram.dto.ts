import { ApiProperty } from '@nestjs/swagger'

export class TelegramLinkTokenResponseDto {
  @ApiProperty({
    description: 'Telegram bot username (không có @)',
    example: 'flashsale_notify_bot'
  })
  botUsername: string

  @ApiProperty({
    description: 'Deep link để user mở Telegram bot và liên kết tài khoản',
    example: 'https://t.me/flashsale_notify_bot?start=xxxx'
  })
  deepLink: string

  @ApiProperty({
    description: 'Thời gian hết hạn token liên kết (giây)',
    example: 600
  })
  expiresInSeconds: number
}

export class TelegramLinkStatusResponseDto {
  @ApiProperty({
    description: 'Đã liên kết Telegram với tài khoản hay chưa',
    example: true
  })
  linked: boolean

  @ApiProperty({
    description: 'Username Telegram đã liên kết (nếu có)',
    required: false,
    nullable: true,
    example: 'alice_store'
  })
  telegramUsername?: string | null

  @ApiProperty({
    description: 'Tên hiển thị Telegram (nếu có)',
    required: false,
    nullable: true,
    example: 'Alice'
  })
  telegramFirstName?: string | null

  @ApiProperty({
    description: 'Thời điểm liên kết Telegram',
    required: false,
    nullable: true,
    example: '2026-04-03T10:30:00.000Z'
  })
  linkedAt?: Date | null
}
