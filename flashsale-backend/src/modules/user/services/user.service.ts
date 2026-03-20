import { Injectable, NotFoundException } from '@nestjs/common'
import { UserRepository, SafeUser } from '../repositories/user.repository'
import { UpdateProfileDto } from '../dto/update-profile.dto'
import { FileService } from '@modules/file/services/file.service'

export type UserResponse = Omit<SafeUser, 'photo'> & {
  avatarUrl: string | null
}

function toUserResponse(user: SafeUser): UserResponse {
  const { photo, ...rest } = user
  return { ...rest, avatarUrl: photo?.url ?? null }
}

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly fileService: FileService
  ) {}

  async getMe(userId: string): Promise<UserResponse> {
    const user = await this.userRepository.findById(userId)
    if (!user) throw new NotFoundException('Người dùng không tồn tại')
    return toUserResponse(user)
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    file?: Express.Multer.File
  ): Promise<UserResponse> {
    const { phone, defaultAddress, ...userFields } = dto

    if (file) {
      const photo = await this.fileService.createPhoto(file)
      await this.userRepository.updateUserFields(userId, {
        avatarId: photo.photoId
      })
    }

    if (userFields.fullName !== undefined) {
      await this.userRepository.updateUserFields(userId, userFields)
    }

    if (phone !== undefined || defaultAddress !== undefined) {
      await this.userRepository.upsertCustomerProfile(userId, {
        phone,
        defaultAddress
      })
    }

    const updated = await this.userRepository.findById(userId)
    if (!updated) throw new NotFoundException('Người dùng không tồn tại')
    return toUserResponse(updated)
  }
}
