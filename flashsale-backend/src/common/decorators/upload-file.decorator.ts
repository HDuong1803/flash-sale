import { applyDecorators, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface'
import { fileMimetypeFilter } from '../filters'
import { FileEncodingInterceptor } from '../interceptors'

export function UploadFile(fieldName = 'file', localOptions?: MulterOptions) {
  return applyDecorators(
    UseInterceptors(
      FileInterceptor(fieldName, localOptions),
      FileEncodingInterceptor
    )
  )
}

export function ApiImageFile(fileName = 'file') {
  return UploadFile(fileName, {
    fileFilter: fileMimetypeFilter('image')
  })
}
