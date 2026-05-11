import type { ConfigService } from '@nestjs/config'
import { PrismaService } from './prisma.service'

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }))

describe('PrismaService', () => {
  it('should be defined', () => {
    const configService = {
      get: jest.fn().mockReturnValue('')
    } as unknown as ConfigService

    const service = new PrismaService(configService)

    expect(service).toBeDefined()
  })
})
