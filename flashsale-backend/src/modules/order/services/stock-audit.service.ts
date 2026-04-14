import { Injectable, Logger } from '@nestjs/common'
import { LockStrategy } from '@prisma/client'
import {
  StockAuditRepository,
  CreateStockAuditData
} from '../repositories/stock-audit.repository'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordStockOperationParams {
  productId: string
  delta: number
  stockBefore: number
  stockAfter: number
  reason: string
  referenceId?: string
  triggeredBy?: string
  strategy?: LockStrategy
  executionTimeUs?: number
}

@Injectable()
export class StockAuditService {
  private readonly logger = new Logger(StockAuditService.name)

  constructor(private readonly stockAuditRepository: StockAuditRepository) {}

  /**
   * Ghi lại một stock operation.
   * Dùng trong OrderWorker sau mỗi Lua DECR để có audit trail đầy đủ.
   *
   * Edge cases:
   * - stockAfter < 0: đánh dấu isOversell = true (không nên xảy ra với Redis Lua)
   * - Không throw nếu ghi log thất bại — không được làm fail order flow
   */
  async record(params: RecordStockOperationParams): Promise<void> {
    const data: CreateStockAuditData = {
      productId: params.productId,
      delta: params.delta,
      stockBefore: params.stockBefore,
      stockAfter: params.stockAfter,
      reason: params.reason,
      referenceId: params.referenceId,
      triggeredBy: params.triggeredBy,
      isOversell: params.stockAfter < 0,
      strategy: params.strategy ?? LockStrategy.REDIS_LUA,
      executionTimeUs: params.executionTimeUs ?? 0
    }

    try {
      await this.stockAuditRepository.create(data)

      // Alert nếu phát hiện oversell trong production (không phải benchmark)
      if (data.isOversell && data.triggeredBy !== 'BENCHMARK') {
        this.logger.error(
          `OVERSELL DETECTED: productId=${data.productId}, stockAfter=${data.stockAfter}, strategy=${data.strategy}. ` +
            `This should never happen with Redis Lua — investigate immediately.`
        )
      }
    } catch (err: unknown) {
      // Không throw — audit log thất bại không được làm fail business flow
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Failed to write stock audit log: ${message}`)
    }
  }

  /**
   * Đếm số lần oversell sau một thời điểm nhất định.
   * Dùng bởi BenchmarkService để verify zero-oversell.
   */
  async countOversell(productId: string, since: Date): Promise<number> {
    return this.stockAuditRepository.countOversell(productId, since)
  }

  /**
   * Tổng hợp metrics để so sánh benchmark strategies.
   */
  async aggregateByStrategy(productId: string, since: Date) {
    return this.stockAuditRepository.aggregateByStrategy(productId, since)
  }
}
