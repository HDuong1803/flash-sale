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
    bufferLogs: true
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

  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        process.env.CLIENT_API_HOST || 'http://localhost:3000',
        process.env.CLIENT_URL,
        process.env.SERVER_URL
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

  app.use(passport.initialize())

  const isProd = configService.get('application.isProd')
  _logger.log({ isProd })

  if (isProd) {
    app.set('trust proxy', 1)
    app
      .use(compression())
      .use(helmet())
      .use(
        RateLimit({
          windowMs: 1 * 60 * 1000,
          max: 1000
        })
      )
  }

  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: {
        enableImplicitConversion: false
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
            message: 'Input data validation failed',
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
        description: 'Enter JWT token',
        in: 'header'
      },
      'JWT-auth'
    )
    .build()

  const document = SwaggerModule.createDocument(app, options)
  SwaggerModule.setup('api', app, document)

  const port = configService.get('application.PORT')

  const logger = new Logger('Bootstrap')

  await app.listen(port, () => {
    logger.log(`Application is running on port ${port}`)
  })

  return app.getUrl()
}
bootstrap()
