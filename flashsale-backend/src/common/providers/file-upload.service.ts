import { Injectable } from '@nestjs/common'
import { CloudinaryService } from '@infrastructure/cloudinary/cloudinary.service'
import { IUploadOutput } from '@common/interfaces'

@Injectable()
export class FileUploadService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  async uploadFile(file: Express.Multer.File): Promise<IUploadOutput> {
    const result = await this.cloudinary.uploadImage(file.buffer)
    return {
      fileUrl: result.secureUrl,
      uploadHash: result.publicId
    }
  }

  async deleteFile(publicId: string): Promise<void> {
    await this.cloudinary.deleteImage(publicId)
  }
}
