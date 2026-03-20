import { Module } from '@nestjs/common'
import { UserController } from './controllers/user.controller'
import { UserService } from './services'
import { UserRepository } from './repositories/user.repository'
import { FileModule } from '@modules/file/file.module'

@Module({
  imports: [FileModule],
  providers: [UserService, UserRepository],
  controllers: [UserController],
  exports: [UserService, UserRepository]
})
export class UserModule {}
