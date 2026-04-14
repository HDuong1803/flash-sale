import { Injectable } from '@nestjs/common'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbLockPurchaseResult {
  success: boolean
  remainingQuantity: number
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
}
