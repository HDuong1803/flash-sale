import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayMinSize
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type, Transform } from 'class-transformer'

/**
 * DTOs for Notification Module
 * Following SOLID principles and NestJS best practices
 */

// ==================== GET NOTIFICATIONS DTOs ====================

export class GetNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by notification types',
    example: ['SYSTEM', 'CONTRACT', 'PAYMENT'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',') : value
  )
  types?: string[]

  @ApiPropertyOptional({
    description: 'Filter by read status',
    example: false
  })
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => {
    if (value === 'true') return true
    if (value === 'false') return false
    return value
  })
  @IsBoolean()
  isRead?: boolean

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    default: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1

  @ApiPropertyOptional({
    description: 'Page size',
    example: 10,
    default: 10
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number = 10
}

export class NotificationSenderDto {
  @ApiProperty()
  email: string

  @ApiProperty()
  firstName: string

  @ApiProperty()
  lastName: string
}

export class NotificationItemDto {
  @ApiProperty()
  notificationTemplateId: number

  @ApiProperty()
  recipientId: number

  @ApiProperty()
  type: string

  @ApiProperty()
  title: string

  @ApiProperty()
  content: unknown

  @ApiProperty()
  metadata: unknown

  @ApiProperty()
  userId: number

  @ApiProperty()
  isGlobal: boolean

  @ApiProperty()
  isRead: boolean

  @ApiProperty()
  created: Date

  @ApiPropertyOptional({ type: NotificationSenderDto })
  sender?: NotificationSenderDto
}

export class GetNotificationsResponseDto {
  @ApiProperty({ type: [NotificationItemDto] })
  notifications: NotificationItemDto[]

  @ApiProperty({
    description: 'Total notifications count'
  })
  total: number
}

// ==================== UPDATE STATUS DTOs ====================

export class UpdateNotificationStatusDto {
  @ApiPropertyOptional({
    description:
      'Array of notification recipient IDs to mark as read. If not provided, marks all as read.',
    example: [1, 2, 3],
    type: [Number]
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  notificationIds?: number[]
}

export class UpdateNotificationStatusResponseDto {
  @ApiProperty({
    description: 'Number of notifications updated'
  })
  updatedCount: number

  @ApiProperty({
    description: 'List of updated notification IDs',
    type: [Number]
  })
  updatedNotificationIds: number[]
}
