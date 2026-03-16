// pagenation-params.dto.ts

import { IsNumber, Min, IsOptional, IsString } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class CursorPaginationParams {
  @ApiPropertyOptional({
    description: 'Cursor for pagination',
    example: 1
  })
  @IsOptional()
  @Type(() => String)
  @IsString()
  cursor?: string

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
