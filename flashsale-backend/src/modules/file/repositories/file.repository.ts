import { Injectable } from '@nestjs/common'
import { FileEntity, Photo } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class FileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createFileEntity(data: {
    id: string
    fileName: string
    mimeType: string
    size: number
    path: string
    url: string
    uploadHash: string
    description: string
  }): Promise<FileEntity> {
    return this.prisma.fileEntity.create({ data })
  }

  async createPhoto(data: {
    id: string
    url: string
    fileEntityId: string
  }): Promise<Photo> {
    return this.prisma.photo.create({ data })
  }
}
