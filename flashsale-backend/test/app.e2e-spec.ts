import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, Controller, Get } from '@nestjs/common'
import request from 'supertest'

@Controller()
class StubAppController {
  @Get()
  ping() {
    return { healthCheck: 'ok' }
  }
}

describe('AppModule (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [StubAppController]
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ healthCheck: 'ok' })
  })

  afterAll(async () => {
    await app.close()
  })
})
