import { Module } from '@nestjs/common'
import { UserController } from './controllers'
import { UserService } from './services'
import { UserRepository } from './repositories/user.repository'

@Module({
  providers: [UserService, UserRepository],
  controllers: [UserController],
  exports: [UserService, UserRepository]
})
export class UserModule {}
