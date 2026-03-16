import { Module } from '@nestjs/common'
import { AdminController } from './controllers'
import { AdminService } from './services'

@Module({
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService]
})
export class AdminModule {}
