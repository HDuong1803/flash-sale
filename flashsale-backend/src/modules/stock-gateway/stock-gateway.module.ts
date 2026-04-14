import { Module } from '@nestjs/common'
import { StockGateway } from './stock.gateway'

/**
 * StockGatewayModule — quản lý kết nối WebSocket real-time.
 *
 * Export StockGateway để OrderWorker và PricingScheduler có thể
 * gọi emitStockUpdate() / emitPriceUpdate() trực tiếp thay vì
 * chỉ dựa vào Redis Pub/Sub (giảm latency một hop).
 */
@Module({
  providers: [StockGateway],
  exports: [StockGateway]
})
export class StockGatewayModule {}
