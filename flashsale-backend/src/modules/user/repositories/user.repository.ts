import { Injectable } from '@nestjs/common'
import { User, MerchantProfile, CustomerProfile } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'
import { UserRole } from '@common/interfaces/role.interface'

export type SafeUser = Omit<
  User & {
    photo: { url: string } | null
    merchantProfile: MerchantProfile | null
    customerProfile: CustomerProfile | null
  },
  'passwordHash'
>

const safeUserSelect = {
  id: true,
  email: true,
  emailVerified: true,
  fullName: true,
  role: true,
  status: true,
  avatarId: true,
  photo: { select: { url: true } },
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  merchantProfile: true,
  customerProfile: true
} as const

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: safeUserSelect
    })
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email }
    })
  }

  async create(data: {
    email: string
    fullName: string
    passwordHash?: string
    role: UserRole
  }): Promise<SafeUser> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        passwordHash: data.passwordHash,
        role: data.role,
        customerProfile: { create: {} }
      },
      select: safeUserSelect
    })
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() }
    })
  }

  async updateUserFields(
    id: string,
    data: { fullName?: string; avatarId?: string }
  ): Promise<void> {
    if (!data.fullName && !data.avatarId) return
    await this.prisma.user.update({ where: { id }, data })
  }

  async upsertCustomerProfile(
    userId: string,
    data: { phone?: string; defaultAddress?: string }
  ): Promise<void> {
    await this.prisma.customerProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data
    })
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { role } })
  }
}
