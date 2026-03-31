// pagenation-params.dto.ts

import { IsNumber, Min, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class PaginationParams {
  @ApiPropertyOptional({
    description: 'ID bắt đầu để phân trang',
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  startId?: number

  @ApiPropertyOptional({
    description: 'Độ lệch để phân trang',
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  offset?: number

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
