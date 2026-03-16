import { Module } from '@nestjs/common'
import { OrderController } from './controllers/order.controller'
import { OrderGatewayService } from './services/order-gateway.service'
import { OrderRepository } from './repositories/order.repository'
import { PurchaseRateLimitGuard } from '@common/guards/purchase-rate-limit.guard'

@Module({
  controllers: [OrderController],
  providers: [OrderGatewayService, OrderRepository, PurchaseRateLimitGuard],
  exports: [OrderRepository]
})
export class OrderModule {}
