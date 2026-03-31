import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class GoogleAuthDto {
  @ApiProperty({
    description: 'ID token Google từ Google Sign-In (GSI)',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  token: string
}
