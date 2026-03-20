import { Module } from '@nestjs/common'
import { FileController } from './controllers/file.controller'
import { FileService } from './services/file.service'
import { FileRepository } from './repositories/file.repository'
import { FileUploadService } from '@common/providers'

@Module({
  controllers: [FileController],
  providers: [FileService, FileRepository, FileUploadService],
  exports: [FileService]
})
export class FileModule {}
