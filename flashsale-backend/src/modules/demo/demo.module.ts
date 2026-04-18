import { Module } from '@nestjs/common'
import { OrderModule } from '@modules/order/order.module'
import { DemoController } from './controllers/demo.controller'
import { DemoService } from './services/demo.service'
import { DemoSeedService } from './services/demo-seed.service'
import { DemoLoadTestService } from './services/demo-load-test.service'
import { DemoRepository } from './repositories/demo.repository'

/**
 * DemoModule — module dùng cho mục đích demo và load test
 *
 * QUAN TRỌNG: Xóa module này trước khi deploy production thực tế.
 * Cách xóa: bỏ import trong AppModule + xóa thư mục src/modules/demo/
 */
@Module({
  imports: [
    // OrderModule cung cấp OrderGatewayService cho load test
    OrderModule
  ],
  controllers: [DemoController],
  providers: [DemoService, DemoSeedService, DemoLoadTestService, DemoRepository]
})
export class DemoModule {}
