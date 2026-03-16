import { ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { PUBLIC_ROUTE_KEY } from '@common/decorators'
import { ForbiddenException } from '../../errors'
import { StrategyToken } from './strategy.enum'

/**
 * AccessTokenGuard - Enhanced to support both JWT types
 * - Legacy JWT (HS256): Backend-generated tokens
 *
 * Automatically tries both strategies in order
 */
@Injectable()
export class AccessTokenGuard extends AuthGuard(StrategyToken.JWT) {
  private readonly logger = new Logger(AccessTokenGuard.name)
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (isPublic) return true

    return super.canActivate(context)
  }

  handleRequest<TUser = any>(err: any, user: any, info: any): TUser {
    // If user authenticated with any strategy, return user
    if (user) {
      return user
    }

    // Log and throw error
    if (err || !user) {
      this.logger.error(info)
      throw err || new ForbiddenException(info || 'Invalid or expired token')
    }

    return user
  }
}
