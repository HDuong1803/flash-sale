import { Injectable, Logger } from '@nestjs/common'
import { FunnelStep } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { AnalyticsRepository } from '../repositories/analytics.repository'

// ─── Kiểu dữ liệu nội bộ ─────────────────────────────────────────────────────

interface FunnelDataEntry {
  step: FunnelStep
  count: number
  /** Tỷ lệ chuyển đổi so với đỉnh funnel (CAMPAIGN_VIEW), đơn vị % (0–100) */
  conversionRate: number
  /** Tỷ lệ rơi rụng so với bước ngay trước đó, đơn vị % (0–100) */
  dropoffRate: number
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly analyticsRepo: AnalyticsRepository
  ) {}

  /**
   * Tạo một bản snapshot tại thời điểm hiện tại cho một sản phẩm trong campaign.
   * Được gọi bởi AnalyticsSchedulerService mỗi 5 phút.
   *
   * Luồng xử lý:
   * 1. Lấy thời gian bắt đầu campaign làm mốc `since` (tính delta từ đầu)
   * 2. Chạy 7 truy vấn song song (Promise.all) để giảm latency
   * 3. Tính toán các chỉ số dẫn xuất (stockRatio, conversionRate, revenueVelocity)
   * 4. Lưu snapshot vào DB
   *
   * Xử lý các trường hợp biên:
   * - Redis stock bị mất: dùng 0 thay vì throw (snapshot vẫn được ghi)
   * - Campaign chưa bắt đầu: since = 24h trước → views = 0 nhưng vẫn ghi snapshot
   * - Chưa có đơn nào: revenue = 0, purchaseCount = 0 → vẫn ghi để có time-series
   */
  async createSnapshot(
    campaignId: string,
    campaignProductId: string
  ): Promise<void> {
    const now = new Date()
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000)

    // Lấy thời điểm bắt đầu campaign để tính delta từ khi campaign khai mạc
    const campaignStart = await this.analyticsRepo.getCampaignStartTime(
      campaignId
    )
    const since = campaignStart ?? new Date(now.getTime() - 24 * 60 * 60_000)

    const stockTotal = await this.analyticsRepo.getCampaignProductTotal(
      campaignProductId
    )

    // Chạy song song 7 truy vấn để giảm thời gian chờ DB
    const [
      redisStock,
      purchaseCount,
      revenue,
      viewCount,
      clickCount,
      attemptCount,
      purchasesLast5m
    ] = await Promise.all([
      this.redis.getStock(campaignProductId), // tồn kho thực từ Redis
      this.analyticsRepo.countCampaignPurchases(campaignId, since),
      this.analyticsRepo.sumCampaignRevenue(campaignId),
      this.analyticsRepo.countFunnelStep(
        campaignId,
        FunnelStep.CAMPAIGN_VIEW,
        since
      ),
      this.analyticsRepo.countFunnelStep(
        campaignId,
        FunnelStep.PRODUCT_CLICK,
        since
      ),
      this.analyticsRepo.countFunnelStep(
        campaignId,
        FunnelStep.PURCHASE_ATTEMPT,
        since
      ),
      this.analyticsRepo.countCampaignPurchases(campaignId, fiveMinAgo) // velocity
    ])

    const stockRemaining = Math.max(0, redisStock ?? 0)
    const stockRatio = stockTotal > 0 ? stockRemaining / stockTotal : 0
    const conversionRate = viewCount > 0 ? purchaseCount / viewCount : 0

    // Tốc độ doanh thu = doanh thu trung bình/đơn × số đơn trong 5 phút gần nhất / 5 phút
    const avgRevenuePerOrder = purchaseCount > 0 ? revenue / purchaseCount : 0
    const revenueVelocity = (purchasesLast5m * avgRevenuePerOrder) / 5

    await this.analyticsRepo.createSnapshot({
      campaignId,
      campaignProductId,
      stockRemaining,
      stockTotal,
      stockRatio,
      purchaseCount,
      revenue,
      conversionRate,
      viewCount,
      clickCount,
      attemptCount,
      purchasesLast5m,
      revenueVelocity
    })
  }

  /** Lấy snapshot mới nhất của campaign để hiển thị trang overview */
  async getCampaignOverview(campaignId: string) {
    return this.analyticsRepo.findLatestSnapshot(campaignId)
  }

  /** Lấy chuỗi dữ liệu theo thời gian để vẽ biểu đồ stock/revenue */
  async getTimeSeries(
    campaignId: string,
    campaignProductId: string,
    limit?: number
  ) {
    return this.analyticsRepo.findTimeSeries(
      campaignId,
      campaignProductId,
      limit
    )
  }

  /**
   * Tính toán dữ liệu funnel chuyển đổi với tỷ lệ rơi rụng tại mỗi bước.
   *
   * Cách tính:
   * - conversionRate: so với đỉnh funnel (CAMPAIGN_VIEW = 100%)
   * - dropoffRate: so với bước ngay trước đó
   * - Bước CAMPAIGN_VIEW luôn có dropoffRate = 0 (không có bước trước)
   * - Phòng trường hợp chia cho 0: topCount = max(views, 1), prevCount = max(prev, 1)
   */
  async getFunnelData(campaignId: string): Promise<FunnelDataEntry[]> {
    const funnelSteps: FunnelStep[] = [
      FunnelStep.CAMPAIGN_VIEW,
      FunnelStep.PRODUCT_CLICK,
      FunnelStep.PURCHASE_ATTEMPT,
      FunnelStep.CHECKOUT_OPEN,
      FunnelStep.PAYMENT_INITIATED,
      FunnelStep.PAYMENT_SUCCESS,
      FunnelStep.PAYMENT_FAILED
    ]

    const counts = await this.analyticsRepo.countFunnelByStep(campaignId)
    // Đỉnh funnel: nếu chưa có view nào thì dùng 1 để tránh chia cho 0
    const topCount = counts[FunnelStep.CAMPAIGN_VIEW] || 1

    return funnelSteps.map((step, i) => {
      const count = counts[step] ?? 0
      // Bước trước đó: nếu = 0 cũng dùng 1 để tránh chia cho 0
      const prevCount =
        i > 0 ? (counts[funnelSteps[i - 1]!] ?? 0) || 1 : topCount
      return {
        step,
        count,
        conversionRate: Math.round((count / topCount) * 100),
        dropoffRate:
          i > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : 0
      }
    })
  }

  /** Lấy heatmap thanh toán theo 24 giờ trong ngày */
  async getHourlyHeatmap(campaignId: string) {
    return this.analyticsRepo.getHourlyHeatmap(campaignId)
  }

  /** Lấy danh sách ID sản phẩm của một campaign (dùng cho batch prediction) */
  async getCampaignProductIds(campaignId: string): Promise<string[]> {
    return this.analyticsRepo.getCampaignProductIds(campaignId)
  }

  /**
   * Ghi nhận sự kiện funnel từ frontend — kiểu fire-and-forget.
   *
   * Luồng: nhận event → try ghi DB → nếu lỗi thì log warn, KHÔNG throw.
   * Caller không cần await — lỗi không ảnh hưởng đến UX người dùng.
   * Ví dụ sự kiện: CAMPAIGN_VIEW, PRODUCT_CLICK, CHECKOUT_OPEN...
   */
  async trackFunnelEvent(
    sessionId: string,
    campaignId: string,
    step: FunnelStep,
    opts: {
      userId?: string
      metadata?: Record<string, unknown>
      ipAddress?: string
    } = {}
  ): Promise<void> {
    try {
      await this.analyticsRepo.createFunnelEvent({
        sessionId,
        userId: opts.userId,
        campaignId,
        step,
        metadata: opts.metadata,
        ipAddress: opts.ipAddress
      })
    } catch (err: unknown) {
      // Lỗi ghi DB không được throw ra ngoài — tracking không được ảnh hưởng UX
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Không thể ghi sự kiện funnel: ${msg}`)
    }
  }
}
