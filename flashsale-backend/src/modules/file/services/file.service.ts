import { Injectable } from '@nestjs/common'
import { FileUploadService, GeneratorService } from '@common/providers'
import { FileRepository } from '../repositories/file.repository'
import { UploadPhotoOutputDto } from '../dto/file.dto'

@Injectable()
export class FileService {
  constructor(
    private readonly fileRepository: FileRepository,
    private readonly fileUploadService: FileUploadService,
    private readonly generatorService: GeneratorService
  ) {}

  async createPhoto(file: Express.Multer.File): Promise<UploadPhotoOutputDto> {
    const uploaded = await this.fileUploadService.uploadFile(file)

    const fileEntityId = this.generatorService.uuid()
    await this.fileRepository.createFileEntity({
      id: fileEntityId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: uploaded.fileUrl,
      url: uploaded.fileUrl,
      uploadHash: uploaded.uploadHash,
      description: ''
    })

    const photoId = this.generatorService.uuid()
    const photo = await this.fileRepository.createPhoto({
      id: photoId,
      url: uploaded.fileUrl,
      fileEntityId
    })

    return {
      photoId: photo.id,
      url: photo.url,
      fileEntityId: photo.fileEntityId
    }
  }
}
