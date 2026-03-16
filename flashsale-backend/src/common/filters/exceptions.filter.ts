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

    // Extract message from response
    let message: string
    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      // Handle both single message and array of messages
      const responseObj = exceptionResponse as any
      if (Array.isArray(responseObj.message)) {
        message = responseObj.message.join(', ')
      } else if (responseObj.message) {
        message = responseObj.message
      } else {
        message = exception.message || 'Internal server error'
      }
    } else {
      message = exception.message || 'Internal server error'
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
