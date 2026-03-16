import { Injectable, NotFoundException } from '@nestjs/common'
import { UserRepository, SafeUser } from '../repositories/user.repository'
import { UpdateProfileDto } from '../dto/update-profile.dto'

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getMe(userId: string): Promise<SafeUser> {
    const user = await this.userRepository.findById(userId)
    if (!user) throw new NotFoundException('Người dùng không tồn tại')
    return user
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto
  ): Promise<SafeUser> {
    const { phone, defaultAddress, ...userFields } = dto

    await this.userRepository.updateUserFields(userId, userFields)

    if (phone !== undefined || defaultAddress !== undefined) {
      await this.userRepository.upsertCustomerProfile(userId, {
        phone,
        defaultAddress
      })
    }

    const updated = await this.userRepository.findById(userId)
    if (!updated) throw new NotFoundException('Người dùng không tồn tại')
    return updated
  }
}
