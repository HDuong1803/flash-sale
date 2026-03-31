// pagenation-params.dto.ts

import { IsNumber, Min, IsOptional, IsString } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class CursorPaginationParams {
  @ApiPropertyOptional({
    description: 'Con trỏ phân trang',
    example: 1
  })
  @IsOptional()
  @Type(() => String)
  @IsString()
  cursor?: string

  @ApiPropertyOptional({
    description: 'Giới hạn phân trang',
    example: 20
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number
}
