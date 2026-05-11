import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('should be defined', () => {
    const health = { check: jest.fn() } as never
    const memory = { checkHeap: jest.fn(), checkRSS: jest.fn() } as never
    const prismaIndicator = { pingCheck: jest.fn() } as never
    const prisma = {} as never
    const redis = { client: { ping: jest.fn() } } as never
    const rabbitmq = { isConnected: jest.fn() } as never

    const controller = new HealthController(
      health,
      memory,
      prismaIndicator,
      prisma,
      redis,
      rabbitmq
    )

    expect(controller).toBeDefined()
  })
})
