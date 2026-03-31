// ⚠️ PHẢI import instrument.ts trước tất cả mọi thứ — Sentry cần patch modules sớm nhất
// Xem: https://docs.sentry.io/platforms/javascript/guides/nestjs/#configure
import './instrument'

import {
  HttpException,
  HttpStatus,
  ValidationPipe,
  VersioningType
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import passport from 'passport'
import RateLimit from 'express-rate-limit'
import { AppModule } from './app.module'
import { Logger } from './common'
import { Config } from './config'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { ValidationError } from 'class-validator'
import { GlobalExceptionFilter } from './errors'

declare global {
  interface BigInt {
    toJSON(): string
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString()
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true
  })

  const _logger = new Logger()
  const configService = app.get<ConfigService>(ConfigService<Config>)

  app.setGlobalPrefix('api', {
    exclude: ['/']
  })
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1'
  })

  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())
  app.use(compression())
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  )

  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        configService.get<string>(
          'application.CLIENT_API_HOST',
          'http://localhost:3000'
        ),
        configService.get<string>('application.CLIENT_URL'),
        configService.get<string>('application.SERVER_URL')
      ].filter(Boolean)

      if (!origin) {
        return callback(null, true)
      }

      const normalizedOrigin = origin.replace(/\/$/, '')
      const normalizedAllowed = allowedOrigins.map(o => o?.replace(/\/$/, ''))

      if (normalizedAllowed.includes(normalizedOrigin)) {
        callback(null, true)
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`))
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
    allowedHeaders:
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Idempotency-Key',
    exposedHeaders: ['Authorization']
  })

  // ─── Request Timeout ──────────────────────────────────────────────────────
  //
  // Ngăn một request bị stuck giữ connection mãi mãi.
  // - Webhook/checkout cần tới 60s (saga + payment gateway)
  // - Mọi request khác: 30s là đủ
  //
  // Khi timeout, Express sẽ gọi res.setTimeout callback.
  // Nếu response chưa gửi, ta trả 503 để client biết thử lại.
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const isLongRunning =
        req.path.includes('/webhook') || req.path.includes('/checkout')
      const timeoutMs = isLongRunning
        ? configService.get<number>(
            'timeouts.LONG_RUNNING_REQUEST_TIMEOUT_MS',
            60_000
          )
        : configService.get<number>(
            'timeouts.NORMAL_REQUEST_TIMEOUT_MS',
            30_000
          )

      res.setTimeout(timeoutMs, () => {
        if (!res.headersSent) {
          res.status(503).json({
            success: false,
            error: {
              code: 'REQUEST_TIMEOUT',
              message: 'Yêu cầu mất quá nhiều thời gian, vui lòng thử lại'
            }
          })
        }
      })

      next()
    }
  )

  app.use(passport.initialize())

  const isProd = configService.get('application.isProd')
  _logger.log({ isProd })

  if (isProd) {
    app.set('trust proxy', 1)
    app.use(
      RateLimit({
        windowMs: 1 * 60 * 1000,
        max: 1000
      })
    )
  }

  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true
      },
      skipMissingProperties: false,
      exceptionFactory: (errors: ValidationError[]) => {
        const result: Record<string, string> = {}

        errors.forEach(error => {
          if (error.constraints) {
            result[error.property] = Object.values(error.constraints)[0]
          }
        })

        throw new HttpException(
          {
            statusCode: 400,
            message: 'Dữ liệu đầu vào không hợp lệ',
            errors: result
          },
          HttpStatus.BAD_REQUEST
        )
      }
    })
  )

  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      for (const key in req.body) {
        if (req.body[key] === '') req.body[key] = undefined
      }
      next()
    }
  )

  const options = new DocumentBuilder()
    .setTitle('Flash Sale Backend API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Nhập JWT token',
        in: 'header'
      },
      'JWT-auth'
    )
    .build()

  const document = SwaggerModule.createDocument(app, options)
  SwaggerModule.setup('api', app, document)

  const port = configService.get('application.PORT')

  const logger = new Logger('Bootstrap')

  // ─── Graceful Shutdown ────────────────────────────────────────────────────
  //
  // Bật NestJS lifecycle hooks: khi nhận SIGTERM/SIGINT (từ Docker, K8s, PM2),
  // NestJS sẽ gọi onModuleDestroy() trên tất cả providers theo đúng thứ tự.
  //
  // Điều này đảm bảo:
  // - HTTP server ngừng nhận request mới
  // - Redis/RabbitMQ connections được đóng sạch (không mất message)
  // - Prisma transactions đang chạy được hoàn thành hoặc rollback
  // - Không còn "connection reset by peer" khi rolling deploy
  //
  // Nếu KHÔNG có điều này: Docker SIGTERM → app exit ngay lập tức → in-flight
  // requests bị drop, webhooks payment bị mất, DB connections leak.
  app.enableShutdownHooks()

  await app.listen(port, () => {
    logger.log(`Application is running on port ${port}`)
  })

  logger.log(`Swagger docs available at: ${await app.getUrl()}/api`)

  return app.getUrl()
}
bootstrap()
