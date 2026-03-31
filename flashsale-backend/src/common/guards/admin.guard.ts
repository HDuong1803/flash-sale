import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ForbiddenException } from '../../errors'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request?.user

    if (!user) {
      throw new ForbiddenException('Chưa xác thực')
    }

    const role =
      typeof user.role === 'string'
        ? user.role.toUpperCase()
        : typeof user.userRole === 'string'
        ? user.userRole.toUpperCase()
        : undefined

    const isAdmin = role === 'ADMIN' || user.isOwner === true

    if (!isAdmin) {
      throw new ForbiddenException('Cần quyền quản trị viên')
    }

    return true
  }
}
