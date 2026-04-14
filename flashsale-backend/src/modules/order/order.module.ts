import { Module } from '@nestjs/common'
import { OrderController } from './controllers/order.controller'
import { OrderGatewayService } from './services/order-gateway.service'
import { StockAuditService } from './services/stock-audit.service'
import { OrderRepository } from './repositories/order.repository'
import { StockAuditRepository } from './repositories/stock-audit.repository'
import { PurchaseRateLimitGuard } from '@common/guards/purchase-rate-limit.guard'
import { FraudModule } from '@modules/fraud/fraud.module'

@Module({
  imports: [FraudModule],
  controllers: [OrderController],
  providers: [
    OrderGatewayService,
    StockAuditService,
    OrderRepository,
    StockAuditRepository,
    PurchaseRateLimitGuard
  ],
  exports: [OrderRepository, StockAuditService, StockAuditRepository]
})
export class OrderModule {}
