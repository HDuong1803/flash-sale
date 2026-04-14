import { Injectable, Logger } from '@nestjs/common'
import { AnalyticsRepository } from '../repositories/analytics.repository'

// ─── Kiểu dữ liệu ────────────────────────────────────────────────────────────

export interface StockoutPrediction {
  campaignProductId: string
  /** Số tồn kho hiện tại */
  currentStock: number
  /** Số phút còn lại đến khi hết hàng (null = không dự đoán được trong 2 giờ tới) */
  stockoutMinutes: number | null
  /** Thời điểm dự đoán hết hàng (null nếu không dự đoán được) */
  stockoutAt: Date | null
  /** Độ tin cậy của dự đoán = R² của hồi quy tuyến tính (0–1) */
  confidence: number
  /** Xu hướng tồn kho: ổn định / giảm / giảm nhanh / đã hết */
  trend: 'STABLE' | 'DECLINING' | 'ACCELERATING' | 'SOLD_OUT'
  /** Số điểm dữ liệu (snapshot) đã dùng để tính */
  dataPoints: number
  /** Tốc độ tiêu thụ trung bình, đơn vị: số lượng/phút */
  velocityPerMinute: number
}

interface RegressionResult {
  /** Độ dốc đường hồi quy (âm = tồn kho đang giảm) */
  slope: number
  /** Hệ số chặn */
  intercept: number
  /** R² — hệ số xác định, đo độ khớp của đường thẳng (0–1) */
  r2: number
}

// ─── Hằng số ─────────────────────────────────────────────────────────────────

/** Số điểm dữ liệu tối thiểu để hồi quy có ý nghĩa */
const MIN_DATA_POINTS = 3
/** Chỉ dự đoán trong phạm vi 2 giờ tới, quá xa thì không tin cậy */
const PREDICTION_HORIZON_MIN = 120
/** Khoảng cách giữa 2 snapshot (phút) */
const SNAPSHOT_INTERVAL_MIN = 5

@Injectable()
export class PredictionService {
  private readonly logger = new Logger(PredictionService.name)

  constructor(private readonly analyticsRepo: AnalyticsRepository) {}

  /**
   * Dự đoán thời điểm hết hàng bằng hồi quy tuyến tính OLS (Ordinary Least Squares).
   *
   * Thuật toán:
   * 1. Lấy 24 snapshot gần nhất (= 2 giờ ở tần suất 5 phút)
   * 2. Trục X = số phút kể từ snapshot đầu tiên
   * 3. Trục Y = số lượng tồn kho tại thời điểm đó
   * 4. Tính OLS: Y = slope × X + intercept
   * 5. Giải phương trình Y = 0 → tìm X → số phút đến khi hết hàng
   * 6. Quy đổi X thành timestamp tuyệt đối
   * 7. Tính R² để đánh giá độ tin cậy
   *
   * Xử lý các trường hợp biên:
   * - slope ≥ 0: tồn kho không giảm → trả về STABLE, stockoutAt = null
   * - Ít hơn MIN_DATA_POINTS: chưa đủ data → trả về STABLE với confidence = 0
   * - Tồn kho đã = 0: trả về SOLD_OUT ngay lập tức
   * - Dự đoán quá xa (> 2 giờ) hoặc âm: trả về null (không tin cậy)
   */
  async predictStockout(
    campaignProductId: string
  ): Promise<StockoutPrediction> {
    const snapshots = await this.analyticsRepo.findRecentSnapshotsForPrediction(
      campaignProductId,
      24 // 24 điểm × 5 phút = 2 giờ gần nhất
    )

    if (snapshots.length === 0) {
      const fallbackStock =
        await this.analyticsRepo.getCampaignProductRemaining(campaignProductId)
      const currentStock = Math.max(0, fallbackStock)

      if (currentStock === 0) {
        return this.buildPrediction(
          campaignProductId,
          0,
          'SOLD_OUT',
          0,
          null,
          1,
          0
        )
      }

      return this.buildPrediction(
        campaignProductId,
        currentStock,
        'STABLE',
        0,
        null,
        0,
        0
      )
    }

    const currentStock = snapshots.at(-1)!.stockRemaining

    // Trường hợp đặc biệt: hàng đã hết
    if (currentStock === 0) {
      return this.buildPrediction(
        campaignProductId,
        0,
        'SOLD_OUT',
        0,
        null,
        1,
        snapshots.length
      )
    }

    // Chưa đủ dữ liệu để hồi quy có ý nghĩa
    if (snapshots.length < MIN_DATA_POINTS) {
      this.logger.debug(
        `Chưa đủ dữ liệu để dự đoán: ${snapshots.length} điểm cho sản phẩm ${campaignProductId}`
      )
      return this.buildPrediction(
        campaignProductId,
        currentStock,
        'STABLE',
        0,
        null,
        0, // confidence = 0 vì không đủ data
        snapshots.length
      )
    }

    // Chuyển đổi sang cặp (phút kể từ điểm đầu, số tồn kho)
    const firstAt = snapshots[0]!.snapshotAt.getTime()
    const points = snapshots.map(s => ({
      x: (s.snapshotAt.getTime() - firstAt) / 60_000,
      y: s.stockRemaining
    }))

    const regression = this.computeOLS(points)

    // slope ≥ 0: tồn kho không giảm → ổn định, không có dự đoán hết hàng
    if (regression.slope >= 0) {
      return this.buildPrediction(
        campaignProductId,
        currentStock,
        'STABLE',
        regression.slope,
        null,
        regression.r2,
        snapshots.length
      )
    }

    // Giải Y = 0: X = -intercept / slope → số phút từ đầu chuỗi đến khi hết hàng
    // Sau đó trừ đi số phút đã qua (latestX) để ra phút còn lại từ hiện tại
    const latestX = points.at(-1)!.x
    const minutesUntilStockout =
      -regression.intercept / regression.slope - latestX

    // Dự đoán ngoài tầm 2 giờ hoặc âm (nghịch lý) → không đáng tin
    if (
      minutesUntilStockout > PREDICTION_HORIZON_MIN ||
      minutesUntilStockout < 0
    ) {
      return this.buildPrediction(
        campaignProductId,
        currentStock,
        'DECLINING',
        regression.slope,
        null,
        regression.r2,
        snapshots.length
      )
    }

    const stockoutAt = new Date(Date.now() + minutesUntilStockout * 60_000)
    // slope < -2 (đơn vị/phút) = tốc độ giảm nhanh → ACCELERATING
    const trend = regression.slope < -2 ? 'ACCELERATING' : 'DECLINING'

    return this.buildPrediction(
      campaignProductId,
      currentStock,
      trend,
      regression.slope,
      { minutes: minutesUntilStockout, at: stockoutAt },
      regression.r2,
      snapshots.length
    )
  }

  /**
   * Thuật toán hồi quy tuyến tính OLS (Ordinary Least Squares).
   *
   * Công thức:
   *   slope     = (n × Σxy − Σx × Σy) / (n × Σx² − (Σx)²)
   *   intercept = (Σy − slope × Σx) / n
   *   R²        = 1 − SS_res / SS_tot
   *
   * Trường hợp biên: mẫu số = 0 (tất cả X giống nhau) → slope = 0, R² = 0.
   */
  private computeOLS(points: { x: number; y: number }[]): RegressionResult {
    const n = points.length
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0

    for (const { x, y } of points) {
      sumX += x
      sumY += y
      sumXY += x * y
      sumX2 += x * x
    }

    const denominator = n * sumX2 - sumX * sumX

    // Tránh chia cho 0 khi tất cả snapshot cùng timestamp (hiếm nhưng có thể xảy ra)
    if (denominator === 0) {
      return { slope: 0, intercept: sumY / n, r2: 0 }
    }

    const slope = (n * sumXY - sumX * sumY) / denominator
    const intercept = (sumY - slope * sumX) / n

    // Tính R² = tỷ lệ phương sai được giải thích bởi đường thẳng
    const meanY = sumY / n
    let ssTot = 0,
      ssRes = 0

    for (const { x, y } of points) {
      const predicted = slope * x + intercept
      ssTot += (y - meanY) ** 2
      ssRes += (y - predicted) ** 2
    }

    // R² trong [0, 1]; clamp về 0 nếu âm (do sai số số học)
    const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot)

    return { slope, intercept, r2 }
  }

  /** Tạo object kết quả dự đoán theo chuẩn StockoutPrediction */
  private buildPrediction(
    campaignProductId: string,
    currentStock: number,
    trend: StockoutPrediction['trend'],
    slope: number,
    stockout: { minutes: number; at: Date } | null,
    confidence: number,
    dataPoints: number
  ): StockoutPrediction {
    return {
      campaignProductId,
      currentStock,
      stockoutMinutes: stockout ? Math.round(stockout.minutes) : null,
      stockoutAt: stockout?.at ?? null,
      confidence: Math.round(confidence * 100) / 100,
      trend,
      dataPoints,
      // Tốc độ tiêu thụ: giá trị tuyệt đối của slope (đơn vị/phút)
      velocityPerMinute: Math.round(Math.abs(slope) * 100) / 100
    }
  }

  /**
   * Dự đoán hàng loạt cho nhiều sản phẩm cùng lúc.
   * Dùng Promise.allSettled để một sản phẩm lỗi không ảnh hưởng các sản phẩm khác.
   * Sản phẩm bị lỗi sẽ bị bỏ qua và ghi log warn.
   */
  async predictMany(
    campaignProductIds: string[]
  ): Promise<StockoutPrediction[]> {
    const results = await Promise.allSettled(
      campaignProductIds.map(id => this.predictStockout(id))
    )

    return results
      .map((r, i) => {
        if (r.status === 'fulfilled') return r.value
        this.logger.warn(
          `Dự đoán thất bại cho sản phẩm ${campaignProductIds[i]}: ${String(
            r.reason
          )}`
        )
        return null
      })
      .filter((r): r is StockoutPrediction => r !== null)
  }

  /** Số điểm dữ liệu tối thiểu cần có để bắt đầu dự đoán */
  minSnapshotsForConfidence(): number {
    return MIN_DATA_POINTS
  }

  /** Khoảng thời gian giữa 2 lần chụp snapshot (phút) */
  snapshotIntervalMinutes(): number {
    return SNAPSHOT_INTERVAL_MIN
  }
}
