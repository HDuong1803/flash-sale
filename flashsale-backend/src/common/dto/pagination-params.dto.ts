// pagenation-params.dto.ts

import { IsNumber, Min, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class PaginationParams {
  @ApiPropertyOptional({
    description: 'Starting ID for pagination',
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  startId?: number

  @ApiPropertyOptional({
    description: 'Offset for pagination',
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  offset?: number

  @ApiPropertyOptional({
    description: 'Limit for pagination',
    example: 20
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number
}
