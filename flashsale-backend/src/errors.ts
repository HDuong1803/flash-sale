import * as common from '@nestjs/common'
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus
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

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()
      // Extract message from exception response
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const responseObj = exceptionResponse as any
        if (Array.isArray(responseObj.message)) {
          // Handle validation errors (array of messages)
          message = responseObj.message.join(', ')
        } else if (responseObj.message) {
          // Handle single message
          message = responseObj.message
        } else if (responseObj.error) {
          // Fallback to error field
          message = responseObj.error
        }
      }
    } else if (exception instanceof Error) {
      // Handle non-HTTP exceptions
      message = exception.message
    } else if (typeof exception === 'string') {
      message = exception
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
