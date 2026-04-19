import { Injectable } from '@nestjs/common'
import { FunnelStep } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

// ─── Kiểu dữ liệu ────────────────────────────────────────────────────────────

export interface CreateSnapshotData {
  campaignId: string
  campaignProductId: string
  stockRemaining: number
  stockTotal: number
  stockRatio: number
  purchaseCount: number
  revenue: number
  conversionRate: number
  viewCount: number
  clickCount: number
  attemptCount: number
  purchasesLast5m: number
  revenueVelocity: number
}

export interface CreateFunnelEventData {
  sessionId: string
  userId?: string
  campaignId: string
  step: FunnelStep
  metadata?: Record<string, unknown>
  ipAddress?: string
}

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isCampaignOwnedByMerchant(
    campaignId: string,
    merchantUserId: string
  ): Promise<boolean> {
    const row = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        merchant: {
          userId: merchantUserId
        }
      },
      select: { id: true }
    })
    return row !== null
  }

  async isCampaignProductInCampaign(
    campaignId: string,
    campaignProductId: string
  ): Promise<boolean> {
    const row = await this.prisma.campaignProduct.findFirst({
      where: {
        id: campaignProductId,
        campaignId
      },
      select: { id: true }
    })
    return row !== null
  }

  async getCampaignProductRemaining(
    campaignProductId: string
  ): Promise<number> {
    const row = await this.prisma.campaignProduct.findUnique({
      where: { id: campaignProductId },
      select: { remainingQuantity: true }
    })
    return row?.remainingQuantity ?? 0
  }

  // ─── Thao tác Snapshot ───────────────────────────────────────────────────────

  /** Lưu một bản snapshot tại thời điểm hiện tại */
  async createSnapshot(data: CreateSnapshotData): Promise<void> {
    await this.prisma.campaignAnalyticsSnapshot.create({ data })
  }

  /**
   * Xóa snapshot cũ theo batch để tránh lock bảng quá lâu.
   * Dùng CTE + LIMIT giúp cleanup chạy ổn định khi dữ liệu lớn.
   */
  async deleteSnapshotsOlderThan(cutoff: Date, limit: number): Promise<number> {
    const safeLimit = Math.max(1, Math.min(limit, 50_000))

    return this.prisma.$executeRaw`
      WITH stale AS (
        SELECT id
        FROM campaign_analytics_snapshots
        WHERE snapshot_at < ${cutoff}
        ORDER BY snapshot_at ASC
        LIMIT ${safeLimit}
      )
      DELETE FROM campaign_analytics_snapshots
      WHERE id IN (SELECT id FROM stale)
    `
  }

  async hasSnapshotsOlderThan(cutoff: Date): Promise<boolean> {
    const row = await this.prisma.campaignAnalyticsSnapshot.findFirst({
      where: { snapshotAt: { lt: cutoff } },
      orderBy: { snapshotAt: 'asc' },
      select: { id: true }
    })
    return row !== null
  }

  /** Lấy snapshot mới nhất của campaign (dùng cho trang overview) */
  async findLatestSnapshot(campaignId: string) {
    return this.prisma.campaignAnalyticsSnapshot.findFirst({
      where: { campaignId },
      orderBy: { snapshotAt: 'desc' }
    })
  }

  /**
   * Lấy chuỗi snapshot theo thời gian để vẽ biểu đồ.
   * - Sắp xếp tăng dần (cũ → mới) để frontend render chart thuận chiều
   * - Giới hạn tối đa 288 điểm = 24 giờ ở tần suất 5 phút/lần
   */
  async findTimeSeries(
    campaignId: string,
    campaignProductId: string,
    limit = 100
  ) {
    return this.prisma.campaignAnalyticsSnapshot.findMany({
      where: { campaignId, campaignProductId },
      orderBy: { snapshotAt: 'asc' },
      take: Math.min(limit, 288),
      select: {
        snapshotAt: true,
        stockRemaining: true,
        stockRatio: true,
        purchaseCount: true,
        revenue: true,
        conversionRate: true,
        purchasesLast5m: true,
        revenueVelocity: true
      }
    })
  }

  /**
   * Lấy các snapshot gần nhất để chạy thuật toán dự đoán hết hàng.
   * Trả về theo thứ tự tăng dần (cũ → mới) — đúng chiều regression tuyến tính.
   * Lấy 24 điểm = 2 giờ gần nhất ở tần suất 5 phút.
   */
  async findRecentSnapshotsForPrediction(
    campaignProductId: string,
    limit = 24
  ) {
    const rows = await this.prisma.campaignAnalyticsSnapshot.findMany({
      where: { campaignProductId },
      orderBy: { snapshotAt: 'desc' }, // lấy mới nhất trước để cắt đúng limit
      take: limit,
      select: { snapshotAt: true, stockRemaining: true }
    })
    return rows.reverse() // đảo lại: cũ → mới cho regression
  }

  // ─── Thao tác sự kiện Funnel ─────────────────────────────────────────────────

  /** Ghi nhận một sự kiện funnel từ frontend */
  async createFunnelEvent(data: CreateFunnelEventData): Promise<void> {
    await this.prisma.funnelEvent.create({
      data: {
        sessionId: data.sessionId,
        userId: data.userId,
        campaignId: data.campaignId,
        step: data.step,
        metadata: data.metadata as object | undefined,
        ipAddress: data.ipAddress
      }
    })
  }

  /**
   * Đếm số sự kiện funnel theo từng bước trong một campaign.
   * Chạy 7 query song song (một query mỗi step) rồi ghép kết quả thành Record.
   */
  async countFunnelByStep(
    campaignId: string
  ): Promise<Record<FunnelStep, number>> {
    const steps: FunnelStep[] = [
      FunnelStep.CAMPAIGN_VIEW,
      FunnelStep.PRODUCT_CLICK,
      FunnelStep.PURCHASE_ATTEMPT,
      FunnelStep.CHECKOUT_OPEN,
      FunnelStep.PAYMENT_INITIATED,
      FunnelStep.PAYMENT_SUCCESS,
      FunnelStep.PAYMENT_FAILED
    ]

    const counts = await Promise.all(
      steps.map(step =>
        this.prisma.funnelEvent.count({ where: { campaignId, step } })
      )
    )

    return Object.fromEntries(
      steps.map((step, i) => [step, counts[i]])
    ) as Record<FunnelStep, number>
  }

  /**
   * Heatmap theo giờ trong ngày: đếm số lần thanh toán thành công (PAYMENT_SUCCESS)
   * theo từng giờ (0–23). Dùng raw SQL + EXTRACT(HOUR) để GROUP BY hiệu quả.
   * Giờ không có giao dịch sẽ được fill về 0.
   */
  async getHourlyHeatmap(
    campaignId: string
  ): Promise<{ hour: number; count: number }[]> {
    const rows = await this.prisma.$queryRaw<{ hour: number; cnt: bigint }[]>`
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS cnt
      FROM funnel_events
      WHERE campaign_id = ${campaignId}
        AND step = 'PAYMENT_SUCCESS'
      GROUP BY hour
      ORDER BY hour
    `

    // Điền 0 cho các giờ không có dữ liệu để frontend có đủ 24 cột
    const map = new Map(rows.map(r => [r.hour, Number(r.cnt)]))
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: map.get(hour) ?? 0
    }))
  }

  // ─── Số liệu mua hàng (qua chuỗi Order → Reservation → CampaignProduct) ────

  /**
   * Đếm số đơn hàng thành công (không CANCELLED) của campaign.
   * Chuỗi join: Order → Reservation → CampaignProduct → Campaign.
   * Tham số `since` cho phép lọc theo khoảng thời gian (dùng cho velocity).
   */
  async countCampaignPurchases(
    campaignId: string,
    since?: Date
  ): Promise<number> {
    return this.prisma.order.count({
      where: {
        reservation: {
          campaignProduct: { campaignId }
        },
        status: { not: 'CANCELLED' },
        ...(since !== undefined && { createdAt: { gte: since } })
      }
    })
  }

  /**
   * Tính tổng doanh thu của campaign (chỉ tính đơn không bị huỷ).
   * Dùng aggregate._sum vì totalAmount là Decimal trong DB.
   */
  async sumCampaignRevenue(campaignId: string): Promise<number> {
    const result = await this.prisma.order.aggregate({
      where: {
        reservation: { campaignProduct: { campaignId } },
        status: { not: 'CANCELLED' }
      },
      _sum: { totalAmount: true }
    })
    return Number(result._sum.totalAmount ?? 0)
  }

  async countProductPurchases(
    campaignProductId: string,
    since?: Date
  ): Promise<number> {
    return this.prisma.order.count({
      where: {
        reservation: {
          campaignProductId
        },
        status: { not: 'CANCELLED' },
        ...(since !== undefined && { createdAt: { gte: since } })
      }
    })
  }

  async sumProductRevenue(
    campaignProductId: string,
    since?: Date
  ): Promise<number> {
    const result = await this.prisma.order.aggregate({
      where: {
        reservation: {
          campaignProductId
        },
        status: { not: 'CANCELLED' },
        ...(since !== undefined && { createdAt: { gte: since } })
      },
      _sum: { totalAmount: true }
    })
    return Number(result._sum.totalAmount ?? 0)
  }

  /**
   * Đếm số sự kiện funnel của một step cụ thể kể từ một mốc thời gian.
   * Dùng để tính viewCount, clickCount, attemptCount trong snapshot.
   */
  async countFunnelStep(
    campaignId: string,
    step: FunnelStep,
    since?: Date
  ): Promise<number> {
    return this.prisma.funnelEvent.count({
      where: {
        campaignId,
        step,
        ...(since !== undefined && { createdAt: { gte: since } })
      }
    })
  }

  /**
   * Lấy thời điểm bắt đầu campaign để tính delta chính xác cho snapshot.
   * Nếu campaign chưa bắt đầu hoặc không tìm thấy, trả về null.
   */
  async getCampaignStartTime(campaignId: string): Promise<Date | null> {
    const row = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { startTime: true }
    })
    return row?.startTime ?? null
  }

  /**
   * Lấy số lượng sản phẩm đã định cho campaign product (saleQuantity).
   * Dùng làm stockTotal trong snapshot.
   */
  async getCampaignProductTotal(campaignProductId: string): Promise<number> {
    const row = await this.prisma.campaignProduct.findUnique({
      where: { id: campaignProductId },
      select: { saleQuantity: true }
    })
    return row?.saleQuantity ?? 0
  }

  /**
   * Lấy danh sách ID sản phẩm của một campaign.
   * Dùng cho batch prediction (dự đoán hàng loạt).
   */
  async getCampaignProductIds(campaignId: string): Promise<string[]> {
    const rows = await this.prisma.campaignProduct.findMany({
      where: { campaignId },
      select: { id: true }
    })
    return rows.map(r => r.id)
  }

  /**
   * Lấy tất cả campaign product đang thuộc campaign ACTIVE.
   * Dùng cho scheduler snapshot — chỉ chụp snapshot khi campaign đang chạy.
   */
  async findActiveCampaignProducts(): Promise<
    { id: string; campaignId: string }[]
  > {
    return this.prisma.campaignProduct.findMany({
      where: {
        campaign: { status: 'ACTIVE' }
      },
      select: {
        id: true,
        campaignId: true
      }
    })
  }
}
