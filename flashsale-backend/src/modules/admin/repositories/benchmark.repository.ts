import { Injectable } from '@nestjs/common'
import { BenchmarkRun } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbLockPurchaseResult {
  success: boolean
  remainingQuantity: number
}

export interface BenchmarkProductContext {
  remainingQuantity: number
  campaignStatus: string
}

@Injectable()
export class BenchmarkRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reset remainingQuantity cho một CampaignProduct cụ thể.
   * Dùng trước khi chạy DB_LOCK scenario để đặt lại stock.
   */
  async resetCampaignProductStock(
    campaignProductId: string,
    amount: number
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE campaign_products
      SET remaining_quantity = ${amount}
      WHERE id = ${campaignProductId}
    `
  }

  /**
   * Mô phỏng mua hàng với DB SELECT FOR UPDATE lock.
   *
   * Edge cases:
   * - Nếu product không tồn tại → trả về success=false
   * - Nếu remaining_quantity <= 0 → trả về success=false (sold out)
   * - Lock tự release khi transaction commit/rollback
   * - Nhiều concurrent calls → PostgreSQL serializes qua FOR UPDATE
   */
  async purchaseWithDbLock(
    campaignProductId: string
  ): Promise<DbLockPurchaseResult> {
    return this.prisma.$transaction(async tx => {
      // SELECT FOR UPDATE — khóa row cho đến khi transaction kết thúc.
      // Các lệnh gọi đồng thời xếp hàng chờ; không có 2 lệnh nào decrement cùng lúc.
      const rows = await tx.$queryRaw<{ remaining_quantity: number }[]>`
        SELECT remaining_quantity
        FROM campaign_products
        WHERE id = ${campaignProductId}
        FOR UPDATE
      `

      if (rows.length === 0) {
        return { success: false, remainingQuantity: 0 }
      }

      const current = rows[0].remaining_quantity

      if (current <= 0) {
        return { success: false, remainingQuantity: 0 }
      }

      await tx.$executeRaw`
        UPDATE campaign_products
        SET remaining_quantity = remaining_quantity - 1
        WHERE id = ${campaignProductId}
      `

      return { success: true, remainingQuantity: current - 1 }
    })
  }

  /**
   * Lấy remaining_quantity hiện tại từ DB.
   */
  async getCampaignProductStock(campaignProductId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ remaining_quantity: number }[]>`
      SELECT remaining_quantity
      FROM campaign_products
      WHERE id = ${campaignProductId}
    `
    return rows[0]?.remaining_quantity ?? 0
  }

  // ─── BenchmarkRun CRUD ────────────────────────────────────────────────────

  async createRun(data: {
    campaignProductId: string
    concurrentUsers: number
    stockAmount: number
    strategyMode: string
  }): Promise<{ id: string }> {
    const run = await this.prisma.benchmarkRun.create({
      data: {
        campaignProductId: data.campaignProductId,
        concurrentUsers: data.concurrentUsers,
        stockAmount: data.stockAmount,
        strategyMode: data.strategyMode,
        status: 'PENDING'
      },
      select: { id: true }
    })
    return run
  }

  async updateRunStatus(
    id: string,
    status: string,
    extra?: {
      result?: object
      errorMessage?: string
      completedAt?: Date
    }
  ): Promise<void> {
    await this.prisma.benchmarkRun.update({
      where: { id },
      data: {
        status,
        ...(extra?.result !== undefined && { result: extra.result }),
        ...(extra?.errorMessage !== undefined && {
          errorMessage: extra.errorMessage
        }),
        ...(extra?.completedAt !== undefined && {
          completedAt: extra.completedAt
        })
      }
    })
  }

  async findRunById(id: string): Promise<BenchmarkRun | null> {
    return this.prisma.benchmarkRun.findUnique({ where: { id } })
  }

  async markOrphanedRunsFailed(): Promise<number> {
    const result = await this.prisma.benchmarkRun.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        errorMessage: 'Server khởi động lại trong khi job đang chạy',
        completedAt: new Date()
      }
    })
    return result.count
  }

  async findHistory(
    page: number,
    limit: number
  ): Promise<{ items: BenchmarkRun[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.benchmarkRun.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.benchmarkRun.count()
    ])
    return { items, total }
  }

  async getBenchmarkProductContext(
    campaignProductId: string
  ): Promise<BenchmarkProductContext | null> {
    const rows = await this.prisma.$queryRaw<
      { remaining_quantity: number; campaign_status: string }[]
    >`
      SELECT cp.remaining_quantity, c.status AS campaign_status
      FROM campaign_products cp
      INNER JOIN campaigns c ON c.id = cp.campaign_id
      WHERE cp.id = ${campaignProductId}
      LIMIT 1
    `

    const row = rows[0]
    if (!row) {
      return null
    }

    return {
      remainingQuantity: row.remaining_quantity,
      campaignStatus: row.campaign_status
    }
  }
}
