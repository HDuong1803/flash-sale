import { Module } from '@nestjs/common'
import { MerchantModule } from '@modules/merchant/merchant.module'
import { ProductController } from './controllers/product.controller'
import { ProductService } from './services/product.service'
import { ProductRepository } from './repositories/product.repository'

@Module({
  imports: [MerchantModule],
  controllers: [ProductController],
  providers: [ProductService, ProductRepository],
  exports: [ProductRepository]
})
export class ProductModule {}
