import { ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { StrategyToken } from './strategy.enum'

/**
 * OptionalAccessTokenGuard — like AccessTokenGuard but never throws.
 * If a valid Bearer token is present, request.user is populated.
 * If no token or invalid token, request.user stays undefined and request continues.
 */
@Injectable()
export class OptionalAccessTokenGuard extends AuthGuard(StrategyToken.JWT) {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context)
    } catch {
      // No token or invalid token — continue without user
    }
    return true
  }
}
