import { ApiProperty } from '@nestjs/swagger'

export class UploadFileDto {
  @ApiProperty({
    required: true,
    type: 'string',
    format: 'binary',
    description: 'File ảnh cần upload'
  })
  file?: Express.Multer.File
}

export class UploadPhotoOutputDto {
  @ApiProperty({ type: 'string', description: 'ID ảnh' })
  photoId: string

  @ApiProperty({ type: 'string', description: 'URL ảnh trên IPFS' })
  url: string

  @ApiProperty({ type: 'string', description: 'ID bản ghi tệp' })
  fileEntityId: string
}
