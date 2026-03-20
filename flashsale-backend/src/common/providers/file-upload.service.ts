import { Injectable } from '@nestjs/common'
import { IUploadOutput } from '@common/interfaces'
import { uploadToIPFS } from '../helper'

@Injectable()
export class FileUploadService {
  async uploadFile(file: Express.Multer.File): Promise<IUploadOutput> {
    return uploadToIPFS(file)
  }
}
