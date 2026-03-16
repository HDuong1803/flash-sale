import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { Request } from 'express'

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Primary: HttpOnly cookie set by auth endpoints
        (req: Request) =>
          (req?.cookies as Record<string, string | undefined>)?.[
            'access_token'
          ] ?? null,
        // Fallback: Authorization header — keeps Swagger / Postman working
        ExtractJwt.fromAuthHeaderAsBearerToken()
      ]),
      secretOrKey: process.env.JWT_SECRET_KEY
    })
  }

  validate(payload: { sub: string; email: string; role: string }) {
    return { userId: payload.sub, email: payload.email, role: payload.role }
  }
}
