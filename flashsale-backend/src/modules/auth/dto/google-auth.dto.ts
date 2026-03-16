import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class GoogleAuthDto {
  @ApiProperty({
    description: 'Google ID token từ Google Sign-In (GSI)',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  token: string
}
