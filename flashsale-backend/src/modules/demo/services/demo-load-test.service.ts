import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { RedisService } from '@infrastructure/redis/redis.service'
import { DemoRepository } from '../repositories/demo.repository'
import { OrderGatewayService } from '@modules/order/services/order-gateway.service'

// Kết quả chi tiết của một request trong load test
interface RequestResult {
  userId: string
  campaignProductId: string
  status: 'ok' | 'error'
  requestId?: string
  errorMessage?: string
  durationMs: number
}

/**
 * DemoLoadTestService — chạy load test concurrent trên campaign ACTIVE
 *
 * Flow:
 *   1. Auto-detect hoặc tìm campaign ACTIVE theo ID
 *   2. (Tùy chọn) Reset per-user purchase limit trong Redis → cho phép chạy lại nhiều lần
 *   3. Chia total requests thành batches, mỗi batch = concurrency requests song song
 *   4. Mỗi request gọi OrderGatewayService.purchase() với user khác nhau
 *      → ghi vào Redis + RabbitMQ → Order Worker xử lý → dashboard chart nhảy
 *   5. Delay tùy chọn giữa các batch để chart mượt hơn
 *   6. Tổng hợp kết quả (success rate, avg/p50/p95/p99 latency, top errors)
 */
@Injectable()
export class DemoLoadTestService {
  private readonly logger = new Logger(DemoLoadTestService.name)

  constructor(
    private readonly repo: DemoRepository,
    private readonly orderGateway: OrderGatewayService,
    private readonly redis: RedisService
  ) {}

  /**
   * runLoadTest — thực thi load test và báo cáo kết quả
   *
   * @param opts.campaignId     - ID campaign cụ thể (bỏ qua nếu autoDetect=true)
   * @param opts.autoDetect     - tự tìm campaign ACTIVE đầu tiên
   * @param opts.concurrency    - số requests song song mỗi batch
   * @param opts.totalRequests  - tổng số purchases
   * @param opts.delayMs        - ms chờ giữa các batch (0 = không chờ)
   * @param opts.resetCounters  - xóa Redis purchase limit trước khi chạy
   * @param onProgress          - callback progress (0-100) + mô tả bước hiện tại
   */
  async runLoadTest(
    opts: {
      campaignId?: string
      autoDetect?: boolean
      concurrency: number
      totalRequests: number
      delayMs?: number
      resetCounters?: boolean
    },
    onProgress: (progress: number, step: string) => Promise<void>
  ): Promise<Record<string, unknown>> {
    const { concurrency, totalRequests } = opts
    const delayMs = opts.delayMs ?? 0
    const resetCounters = opts.resetCounters ?? true

    // Bước 1: Tìm campaign
    await onProgress(5, 'Đang tải thông tin campaign...')
    let campaign: Awaited<ReturnType<typeof this.repo.findActiveCampaignById>>

    if (opts.autoDetect || !opts.campaignId) {
      campaign = await this.repo.findAnyActiveCampaign()
      if (!campaign) {
        throw new Error(
          'Không tìm thấy ACTIVE campaign. Chạy pnpm seed trước rồi thử lại.'
        )
      }
    } else {
      campaign = await this.repo.findActiveCampaignById(opts.campaignId)
      if (!campaign) {
        throw new Error(
          `Campaign "${opts.campaignId}" không tồn tại hoặc không đang ACTIVE`
        )
      }
    }

    if (!campaign.campaignProducts.length) {
      throw new Error(`Campaign "${campaign.id}" không có sản phẩm nào`)
    }

    // Bước 2: Reset purchase counters (cho phép chạy lại nhiều lần)
    if (resetCounters) {
      await onProgress(8, 'Đang reset per-user purchase limits...')
      let totalDeleted = 0
      for (const cp of campaign.campaignProducts) {
        const n = await this.redis.deletePurchaseLimitKeys(
          `purchase_limit:${cp.id}:*`
        )
        totalDeleted += n
      }
      this.logger.log(
        `[LoadTest] Reset ${totalDeleted} purchase limit keys cho campaign ${campaign.id}`
      )
    }

    // Bước 3: Tải customers
    await onProgress(10, 'Đang tải danh sách customers...')
    const customers = await this.repo.findHistoricalCustomers(500)
    if (customers.length === 0) {
      throw new Error(
        'Không tìm thấy historical customers. Chạy pnpm seed:historical trước.'
      )
    }

    const cpIds = campaign.campaignProducts.map(cp => cp.id)
    const campaignId = campaign.id
    const t0 = Date.now()
    const allResults: RequestResult[] = []
    let done = 0

    this.logger.log(
      `[LoadTest] Bắt đầu: campaign=${campaignId}, ` +
        `customers=${customers.length}, products=${cpIds.length}, ` +
        `total=${totalRequests}, concurrency=${concurrency}, delay=${delayMs}ms`
    )

    // Bước 4: Chạy từng batch song song
    while (done < totalRequests) {
      const batchSize = Math.min(concurrency, totalRequests - done)
      const progress = 10 + Math.round((done / totalRequests) * 85)
      await onProgress(
        progress,
        `Đang gửi request ${done + 1}–${done + batchSize} / ${totalRequests}...`
      )

      const batchResults = await Promise.allSettled(
        Array.from({ length: batchSize }, async (_, i) => {
          const reqIdx = done + i
          // Xoay vòng customers và campaign products để phân tán đều
          const customer = customers[reqIdx % customers.length]
          const cpId = cpIds[reqIdx % cpIds.length]
          // Mỗi request có idempotency key duy nhất → không bị dedup
          const idempotencyKey = `lt:${campaignId}:${
            customer.id
          }:${reqIdx}:${randomUUID().slice(0, 8)}`

          const tReq = Date.now()
          try {
            const result = await this.orderGateway.purchase(
              customer.id,
              { campaignProductId: cpId, quantity: 1 },
              idempotencyKey
            )
            return {
              userId: customer.id,
              campaignProductId: cpId,
              status: 'ok' as const,
              requestId: result.requestId,
              durationMs: Date.now() - tReq
            }
          } catch (err) {
            return {
              userId: customer.id,
              campaignProductId: cpId,
              status: 'error' as const,
              errorMessage: err instanceof Error ? err.message : String(err),
              durationMs: Date.now() - tReq
            }
          }
        })
      )

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          allResults.push(settled.value)
        } else {
          allResults.push({
            userId: 'unknown',
            campaignProductId: 'unknown',
            status: 'error',
            errorMessage: String(settled.reason),
            durationMs: 0
          })
        }
      }

      done += batchSize

      // Delay giữa batches — tạo hiệu ứng mượt trên chart dashboard
      if (delayMs > 0 && done < totalRequests) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }

    // Bước 3: Tổng hợp kết quả
    await onProgress(98, 'Đang tổng hợp kết quả...')
    const elapsed = Date.now() - t0
    const successCount = allResults.filter(r => r.status === 'ok').length
    const errorCount = allResults.filter(r => r.status === 'error').length
    const durations = allResults.map(r => r.durationMs).sort((a, b) => a - b)

    const avg = Math.round(
      durations.reduce((s, d) => s + d, 0) / durations.length
    )
    const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0
    const p99 = durations[Math.floor(durations.length * 0.99)] ?? 0

    // Nhóm lỗi phổ biến
    const errorGroups: Record<string, number> = {}
    for (const r of allResults) {
      if (r.status === 'error' && r.errorMessage) {
        const key = r.errorMessage.slice(0, 80)
        errorGroups[key] = (errorGroups[key] ?? 0) + 1
      }
    }

    this.logger.log(
      `Load test done: ${successCount}/${totalRequests} success, ${errorCount} errors, ` +
        `avg=${avg}ms, p95=${p95}ms, elapsed=${elapsed}ms`
    )

    return {
      campaignId,
      totalRequests,
      concurrency,
      successCount,
      errorCount,
      successRate: `${((successCount / totalRequests) * 100).toFixed(1)}%`,
      latency: { avg, p50, p95, p99 },
      elapsedMs: elapsed,
      topErrors: errorGroups
    }
  }
}
