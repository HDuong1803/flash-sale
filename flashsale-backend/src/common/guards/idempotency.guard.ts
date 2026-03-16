import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable
} from '@nestjs/common'

@Injectable()
export class IdempotencyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string> }>()
    const key = request.headers['x-idempotency-key']
    if (!key || typeof key !== 'string' || key.length < 10) {
      throw new BadRequestException(
        'Header X-Idempotency-Key là bắt buộc (tối thiểu 10 ký tự)'
      )
    }
    return true
  }
}
