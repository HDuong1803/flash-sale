import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { GHNService } from './ghn.service'
import { GHNAddressService } from './ghn.address.service'

@Module({
  imports: [
    HttpModule.register({
      timeout: 15_000,
      maxRedirects: 3
    })
  ],
  providers: [GHNService, GHNAddressService],
  exports: [GHNService, GHNAddressService]
})
export class GHNModule {}
