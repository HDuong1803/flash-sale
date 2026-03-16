import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class RefreshDto {
  @ApiProperty({
    description: 'Refresh token để lấy access token mới',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string
}
