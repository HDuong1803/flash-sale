import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException
} from '@nestjs/common'
import { Request, Response } from 'express'

@Catch(HttpException)
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const status = exception.getStatus()

    // Get the response from the exception
    const exceptionResponse = exception.getResponse()

    // Extract message/code from response payload if provided by service layer.
    let message: string
    let code: string | undefined
    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      // Handle both single message and array of messages.
      const responseObj = exceptionResponse as any
      if (typeof responseObj.code === 'string') {
        code = responseObj.code
      }

      if (
        responseObj.error &&
        typeof responseObj.error === 'object' &&
        typeof responseObj.error.code === 'string'
      ) {
        code = responseObj.error.code
      }

      if (Array.isArray(responseObj.message)) {
        message = responseObj.message.join(', ')
      } else if (responseObj.message) {
        message = responseObj.message
      } else if (
        responseObj.error &&
        typeof responseObj.error === 'object' &&
        responseObj.error.message
      ) {
        message = responseObj.error.message
      } else {
        message = exception.message || 'Lỗi máy chủ nội bộ'
      }
    } else {
      message = exception.message || 'Lỗi máy chủ nội bộ'
    }

    response.status(status).json({
      success: false,
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url
    })
  }
}
