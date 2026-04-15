import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { EasyPostService } from './easypost.service'

@Module({
  imports: [
    HttpModule.register({
      timeout: 15_000,
      maxRedirects: 3
    })
  ],
  providers: [EasyPostService],
  exports: [EasyPostService]
})
export class EasyPostModule {}
