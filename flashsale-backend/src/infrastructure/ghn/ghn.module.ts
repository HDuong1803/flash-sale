import { Module } from '@nestjs/common'
import { GHNService } from './ghn.service'
import { GHNAddressService } from './ghn.address.service'
import { GHNAddressController } from './ghn.address.controller'

@Module({
  controllers: [GHNAddressController],
  providers: [GHNService, GHNAddressService],
  exports: [GHNService, GHNAddressService]
})
export class GHNModule {}
