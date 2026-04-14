import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PriceAction, PricingStrategy } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatePricingRuleData {
  campaignProductId: string
  name: string
  strategy: PricingStrategy
  priority: number
  stockRatioLow?: number
  stockRatioHigh?: number
  stockAction?: PriceAction
  velocityMin?: number
  velocityMax?: number
  velocityAction?: PriceAction
  minutesBeforeEnd?: number
  timeAction?: PriceAction
  adjustmentPct: number
  minPrice: number
  maxPrice: number
}

export interface RecordPriceHistoryData {
  campaignProductId: string
  ruleId?: string
  oldPrice: number
  newPrice: number
  changePct: number
  reason: string
  triggeredBy: string
  stockAtChange: number
  velocityAtChange: number
  timeRemainingMin: number
}

export interface CampaignProductWithRules {
  id: string
  campaignId: string
  salePrice: Decimal
  saleQuantity: number
  remainingQuantity: number
  campaign: {
    status: string
    endTime: Date
  }
  pricingRules: {
    id: string
    name: string
    strategy: PricingStrategy
    priority: number
    isActive: boolean
    stockRatioLow: number | null
    stockRatioHigh: number | null
    stockAction: PriceAction | null
    velocityMin: number | null
    velocityMax: number | null
    velocityAction: PriceAction | null
    minutesBeforeEnd: number | null
    timeAction: PriceAction | null
    adjustmentPct: number
    minPrice: number
    maxPrice: number
  }[]
}

@Injectable()
export class PricingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isCampaignProductOwnedByMerchant(
    campaignProductId: string,
    merchantUserId: string
  ): Promise<boolean> {
    const row = await this.prisma.campaignProduct.findFirst({
      where: {
        id: campaignProductId,
        campaign: {
          merchant: {
            userId: merchantUserId
          }
        }
      },
      select: { id: true }
    })

    return row !== null
  }

  /**
   * Lấy các campaign product đang active và có ít nhất một rule pricing đang active.
   * Dùng bởi scheduler để biết cần evaluate những sản phẩm nào.
   */
  async findActivePricingTargets(): Promise<
    { id: string; campaignId: string }[]
  > {
    return this.prisma.campaignProduct.findMany({
      where: {
        campaign: { status: 'ACTIVE' },
        pricingRules: { some: { isActive: true } }
      },
      select: { id: true, campaignId: true }
    })
  }

  /**
   * Lấy thông tin một campaign product kèm danh sách pricing rules đang active.
   */
  async findProductWithRules(
    campaignProductId: string
  ): Promise<CampaignProductWithRules | null> {
    return this.prisma.campaignProduct.findUnique({
      where: { id: campaignProductId },
      include: {
        campaign: {
          select: { status: true, endTime: true }
        },
        pricingRules: {
          where: { isActive: true },
          orderBy: { priority: 'desc' }
        }
      }
    }) as Promise<CampaignProductWithRules | null>
  }

  /**
   * Đếm số reservation được tạo trong N phút gần nhất (dùng để tính velocity).
   */
  async countRecentReservations(
    campaignProductId: string,
    sinceMinutes: number
  ): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60_000)
    return this.prisma.reservation.count({
      where: {
        campaignProductId,
        status: { in: ['HOLDING', 'PAID'] },
        createdAt: { gte: since }
      }
    })
  }

  /**
   * Áp dụng thay đổi giá trong một transaction nguyên tử:
   * 1. Cập nhật CampaignProduct.salePrice
   * 2. Chèn bản ghi PriceHistory để lưu lịch sử
   */
  async applyPriceChange(
    campaignProductId: string,
    data: RecordPriceHistoryData
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.campaignProduct.update({
        where: { id: campaignProductId },
        data: { salePrice: new Decimal(data.newPrice) }
      }),
      this.prisma.priceHistory.create({ data })
    ])
  }

  /**
   * Lấy lịch sử thay đổi giá có phân trang cho một campaign product.
   */
  async findPriceHistory(
    campaignProductId: string,
    limit = 50
  ): Promise<
    {
      id: string
      oldPrice: number
      newPrice: number
      changePct: number
      reason: string
      triggeredBy: string
      stockAtChange: number
      velocityAtChange: number
      timeRemainingMin: number
      createdAt: Date
    }[]
  > {
    return this.prisma.priceHistory.findMany({
      where: { campaignProductId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200)
    })
  }

  /**
   * Tạo một pricing rule mới cho một campaign product.
   */
  async createRule(data: CreatePricingRuleData) {
    return this.prisma.pricingRule.create({ data })
  }

  /**
   * Lấy tất cả pricing rules của một campaign product.
   */
  async findRules(campaignProductId: string) {
    return this.prisma.pricingRule.findMany({
      where: { campaignProductId },
      orderBy: { priority: 'desc' }
    })
  }

  /**
   * Vô hiệu hóa mềm một pricing rule (không xóa để giữ audit trail).
   */
  async deactivateRule(ruleId: string): Promise<void> {
    await this.prisma.pricingRule.update({
      where: { id: ruleId },
      data: { isActive: false }
    })
  }

  /**
   * Kiểm tra quyền sở hữu: đảm bảo pricing rule thuộc về merchant đang đăng nhập (bảo mật).
   */
  async findRuleWithMerchantCheck(
    ruleId: string,
    merchantUserId: string
  ): Promise<{ id: string } | null> {
    return this.prisma.pricingRule.findFirst({
      where: {
        id: ruleId,
        campaignProduct: {
          campaign: { merchant: { userId: merchantUserId } }
        }
      },
      select: { id: true }
    })
  }

  /**
   * Lấy giá bán hiện tại của một campaign product.
   */
  async getCurrentPrice(campaignProductId: string): Promise<Decimal | null> {
    const row = await this.prisma.campaignProduct.findUnique({
      where: { id: campaignProductId },
      select: { salePrice: true }
    })
    return row?.salePrice ?? null
  }
}
