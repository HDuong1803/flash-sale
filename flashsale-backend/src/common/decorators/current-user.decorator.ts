import {
  createParamDecorator,
  ExecutionContext,
  HttpException,
  HttpStatus,
  UnauthorizedException
} from '@nestjs/common'

export interface IUserFromRequest {
  userId: string
  email?: string
}

export const CurrentUser = createParamDecorator(
  (data, context: ExecutionContext) => {
    let request
    switch (context.getType() as string) {
      case 'http':
        request = context.switchToHttp().getRequest()
        break
      case 'ws':
        request = context.switchToWs().getClient()
        break
      case 'rpc':
        throw new HttpException(
          'Not implemented',
          HttpStatus.INTERNAL_SERVER_ERROR
        )
      default:
        throw new HttpException(
          'Not implemented',
          HttpStatus.INTERNAL_SERVER_ERROR
        )
    }
    const user = request?.user
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy người dùng trong request')
    }
    return user as IUserFromRequest
  }
)

export const OptionalCurrentUser = createParamDecorator(
  (data, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest()
    return (request?.user as IUserFromRequest) ?? null
  }
)

export const HttpUser = createParamDecorator(
  (data, context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest()
    if (!req.user) {
      throw new UnauthorizedException('Không tìm thấy người dùng trong request')
    }
    return req.user as IUserFromRequest
  }
)
