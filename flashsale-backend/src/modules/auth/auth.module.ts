import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'

import { AuthController } from './controller/auth.controller'
import { AuthService } from './services/auth.service'
import { TokenService } from './services/token.service'
import { AccessTokenStrategy } from './strategies/access-token.strategy'

import { RedisModule } from '@infrastructure/redis/redis.module'
import { UserModule } from '@modules/user/user.module'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    RedisModule,
    UserModule
  ],
  providers: [AuthService, TokenService, AccessTokenStrategy],
  controllers: [AuthController],
  exports: [AuthService]
})
export class AuthModule {}
