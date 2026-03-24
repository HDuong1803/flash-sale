import * as Sentry from '@sentry/nestjs'
import * as common from '@nestjs/common'
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common'
import { Request, Response } from 'express'

export class ForbiddenException extends common.ForbiddenException {
  statusCode!: number
  message!: string
}

export class NotFoundException extends common.NotFoundException {
  statusCode!: number
  message!: string
}

/**
 * Global exception filter — bắt TẤT CẢ exceptions trong ứng dụng.
 *
 * Trách nhiệm:
 * 1. Chuẩn hoá response format: `{ success, message, data, timestamp, path }`
 * 2. Capture lỗi server (5xx) lên Sentry với đầy đủ context
 * 3. Ghi log đầy đủ cho ops team
 *
 * Quy tắc capture Sentry:
 * - 5xx (server error): capture với full context (userId, url, method, stack)
 * - Non-HTTP exception (runtime error): capture vì đây là bug không mong muốn
 * - 4xx (client error): KHÔNG capture — không phải bug server
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const responseObj = exceptionResponse as Record<string, unknown>
        if (Array.isArray(responseObj['message'])) {
          message = (responseObj['message'] as string[]).join(', ')
        } else if (typeof responseObj['message'] === 'string') {
          message = responseObj['message']
        } else if (typeof responseObj['error'] === 'string') {
          message = responseObj['error']
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message
    } else if (typeof exception === 'string') {
      message = exception
    }

    // ─── Sentry capture: chỉ 5xx và lỗi không phải HTTP ────────────────────
    //
    // Logic: nếu là HttpException thì đây là lỗi có chủ đích (validation,
    // auth, not found...). Chỉ capture khi status >= 500 (lỗi server thực sự)
    // hoặc khi KHÔNG phải HttpException (runtime error, DB crash, ...).
    const isServerError = !(exception instanceof HttpException) || status >= 500

    if (isServerError) {
      // Lấy userId từ request nếu đã auth
      const userId = (request as Request & { user?: { userId?: string } }).user
        ?.userId

      Sentry.withScope(scope => {
        // Gắn tag để filter trong Sentry dashboard
        scope.setTag('http.method', request.method)
        scope.setTag('http.url', request.url)
        scope.setTag('http.status_code', status)

        // Gắn request context
        scope.setContext('request', {
          method: request.method,
          url: request.url,
          headers: {
            'user-agent': request.headers['user-agent'],
            'x-forwarded-for': request.headers['x-forwarded-for']
          }
          // KHÔNG log Authorization header — tránh lộ token
        })

        // Gắn user identity để dễ theo dõi "user X gặp lỗi Y"
        if (userId) {
          scope.setUser({ id: userId })
        }

        if (exception instanceof Error) {
          Sentry.captureException(exception)
        } else {
          // Exception là string hoặc object không phải Error
          Sentry.captureMessage(
            `Unhandled exception: ${JSON.stringify(exception)}`,
            'error'
          )
        }
      })

      // Log đầy đủ stack trace cho ops team (Pino/Winston sẽ ghi vào file)
      this.logger.error({
        event: 'unhandled_exception',
        status,
        message,
        url: request.url,
        method: request.method,
        userId,
        stack: exception instanceof Error ? exception.stack : undefined
      })
    }

    response.status(status).json({
      success: false,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url
    })
  }
}
