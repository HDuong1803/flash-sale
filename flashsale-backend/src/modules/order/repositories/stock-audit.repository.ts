import { Injectable } from '@nestjs/common'
import { LockStrategy, Prisma } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateStockAuditData {
  productId: string
  delta: number
  stockBefore: number
  stockAfter: number
  reason: string
  referenceId?: string
  triggeredBy?: string
  isOversell: boolean
  strategy: LockStrategy
  executionTimeUs: number
}

export interface StockAuditQueryOptions {
  productId?: string
  isOversell?: boolean
  strategy?: LockStrategy
  since?: Date
  page?: number
  limit?: number
}

@Injectable()
export class StockAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateStockAuditData): Promise<void> {
    await this.prisma.stockAuditLog.create({ data })
  }

  /**
   * Batch create — dùng trong benchmark để tránh N round-trips
   */
  async createMany(records: CreateStockAuditData[]): Promise<void> {
    await this.prisma.stockAuditLog.createMany({ data: records })
  }

  /**
   * Đếm số lần oversell trong khoảng thời gian cho một sản phẩm cụ thể.
   * Dùng để xác minh zero-oversell sau benchmark.
   */
  async countOversell(productId: string, since: Date): Promise<number> {
    return this.prisma.stockAuditLog.count({
      where: { productId, isOversell: true, createdAt: { gte: since } }
    })
  }

  /**
   * Tổng hợp metrics theo strategy để so sánh benchmark.
   * Returns: avg execution time, min, max, count grouped by strategy.
   */
  async aggregateByStrategy(
    productId: string,
    since: Date
  ): Promise<
    {
      strategy: LockStrategy
      avgUs: number
      minUs: number
      maxUs: number
      count: number
      oversellCount: number
    }[]
  > {
    const rows = await this.prisma.$queryRaw<
      {
        strategy: LockStrategy
        avg_us: number
        min_us: number
        max_us: number
        cnt: bigint
        oversell_cnt: bigint
      }[]
    >`
      SELECT
        strategy,
        AVG(execution_time_us)::float   AS avg_us,
        MIN(execution_time_us)          AS min_us,
        MAX(execution_time_us)          AS max_us,
        COUNT(*)                        AS cnt,
        COUNT(*) FILTER (WHERE is_oversell) AS oversell_cnt
      FROM stock_audit_logs
      WHERE product_id = ${productId}
        AND created_at >= ${since}
      GROUP BY strategy
    `

    return rows.map(r => ({
      strategy: r.strategy,
      avgUs: Math.round(r.avg_us),
      minUs: r.min_us,
      maxUs: r.max_us,
      count: Number(r.cnt),
      oversellCount: Number(r.oversell_cnt)
    }))
  }

  async findMany(opts: StockAuditQueryOptions): Promise<{
    data: {
      id: string
      productId: string
      delta: number
      stockBefore: number
      stockAfter: number
      reason: string
      referenceId: string | null
      triggeredBy: string | null
      isOversell: boolean
      strategy: LockStrategy
      executionTimeUs: number
      createdAt: Date
    }[]
    total: number
  }> {
    const page = opts.page ?? 1
    const limit = Math.min(opts.limit ?? 50, 200)
    const skip = (page - 1) * limit

    const where: Prisma.StockAuditLogWhereInput = {
      ...(opts.productId !== undefined && { productId: opts.productId }),
      ...(opts.isOversell !== undefined && { isOversell: opts.isOversell }),
      ...(opts.strategy !== undefined && { strategy: opts.strategy }),
      ...(opts.since !== undefined && { createdAt: { gte: opts.since } })
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      this.prisma.stockAuditLog.count({ where })
    ])

    return { data, total }
  }
}
