import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsIP,
  IsNumber,
  IsOptional,
  IsString,
  Min
} from 'class-validator'
import { Transform, Type } from 'class-transformer'

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class FraudEventResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the fraud event',
    example: 'cld8a1b2c3d4e5f6g7h8i9j0'
  })
  id: string

  @ApiPropertyOptional({
    description:
      'User ID associated with the request (null if unauthenticated)',
    example: 'user_abc123'
  })
  userId: string | null

  @ApiProperty({
    description: 'IP address of the incoming request',
    example: '192.168.1.100'
  })
  ipAddress: string

  @ApiProperty({
    description: 'User-Agent header from the request',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  })
  userAgent: string

  @ApiProperty({
    description: 'Type of request that triggered the evaluation',
    example: 'PURCHASE'
  })
  requestType: string

  @ApiProperty({
    description: 'Computed fraud risk score between 0.0 and 1.0',
    example: 0.85,
    minimum: 0,
    maximum: 1
  })
  riskScore: number

  @ApiProperty({
    description: 'Whether the request was blocked based on risk score',
    example: true
  })
  blocked: boolean

  @ApiPropertyOptional({
    description: 'Reason the request was blocked (null if allowed)',
    example: 'BOT_USER_AGENT'
  })
  blockReason: string | null

  @ApiProperty({
    description: 'List of rule names that were triggered during evaluation',
    example: ['BOT_USER_AGENT', 'IP_RATE_LIMIT'],
    type: [String]
  })
  triggeredRules: string[]

  @ApiPropertyOptional({
    description: 'Campaign ID associated with the request',
    example: 'campaign_xyz789'
  })
  campaignId: string | null

  @ApiProperty({
    description: 'Timestamp when the fraud event was recorded',
    example: '2026-04-14T10:30:00.000Z'
  })
  createdAt: Date
}

export class TopIpEntryDto {
  @ApiProperty({
    description: 'IP address',
    example: '10.0.0.1'
  })
  ip: string

  @ApiProperty({
    description: 'Number of blocked attempts from this IP',
    example: 47
  })
  count: number
}

export class FraudStatsDto {
  @ApiProperty({
    description: 'Total number of fraud events evaluated in the period',
    example: 1523
  })
  total: number

  @ApiProperty({
    description: 'Number of requests that were blocked',
    example: 312
  })
  blocked: number

  @ApiProperty({
    description: 'Ratio of blocked to total requests (0.0 - 1.0)',
    example: 0.2048
  })
  blockRate: number

  @ApiProperty({
    description: 'Top 10 IPs with the most blocked attempts',
    type: [TopIpEntryDto]
  })
  topIps: TopIpEntryDto[]
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class BlacklistIpDto {
  @ApiProperty({
    description: 'IP address to blacklist (IPv4 or IPv6)',
    example: '192.168.1.100'
  })
  @IsIP()
  ipAddress: string

  @ApiProperty({
    description: 'Reason for blacklisting the IP',
    example: 'Repeated bot traffic detected during flash sale campaign'
  })
  @IsString()
  reason: string

  @ApiPropertyOptional({
    description:
      'Duration in hours before the blacklist entry expires. Omit for permanent ban.',
    example: 24
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  hours?: number
}

export class FraudQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    default: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({
    description: 'Number of results per page',
    example: 20,
    default: 20
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20

  @ApiPropertyOptional({
    description: 'Filter by blocked status. Omit to return all events.',
    example: true
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true
    if (value === 'false') return false
    return value
  })
  @IsBoolean()
  blocked?: boolean
}

export class SimulateFraudDto {
  @ApiProperty({
    description: 'Campaign ID to associate with simulated fraud events',
    example: 'campaign_xyz789'
  })
  @IsString()
  campaignId: string

  @ApiProperty({
    description: 'Number of fake fraud events to generate (max 200)',
    example: 50
  })
  @IsNumber()
  @Min(1)
  count: number
}
