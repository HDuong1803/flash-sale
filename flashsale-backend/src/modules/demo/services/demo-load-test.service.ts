import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
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
 *   1. Lấy campaign ACTIVE từ DB, lấy danh sách customers hist-customer-*
 *   2. Chia total requests thành batch, mỗi batch = concurrency requests song song
 *   3. Mỗi request gọi OrderGatewayService.purchase() với user khác nhau
 *   4. Tổng hợp kết quả (success rate, avg latency, errors)
 */
@Injectable()
export class DemoLoadTestService {
  private readonly logger = new Logger(DemoLoadTestService.name)

  constructor(
    private readonly repo: DemoRepository,
    private readonly orderGateway: OrderGatewayService
  ) {}

  /**
   * runLoadTest — thực thi load test và báo cáo kết quả
   * @param opts - campaignId, concurrency, totalRequests
   * @param onProgress - callback progress (0-100) + mô tả bước
   */
  async runLoadTest(
    opts: { campaignId: string; concurrency: number; totalRequests: number },
    onProgress: (progress: number, step: string) => Promise<void>
  ): Promise<Record<string, unknown>> {
    const { campaignId, concurrency, totalRequests } = opts

    // Bước 1: Load campaign + customers
    await onProgress(5, 'Đang tải thông tin campaign...')
    const campaign = await this.repo.findActiveCampaignById(campaignId)
    if (!campaign) {
      throw new Error(
        `Campaign "${campaignId}" không tồn tại hoặc không đang ACTIVE`
      )
    }
    if (!campaign.campaignProducts.length) {
      throw new Error(`Campaign "${campaignId}" không có sản phẩm nào`)
    }

    await onProgress(10, 'Đang tải danh sách customers...')
    const customers = await this.repo.findHistoricalCustomers(500)
    if (customers.length === 0) {
      throw new Error(
        'Không tìm thấy historical customers. Hãy chạy seed trước.'
      )
    }

    const cpIds = campaign.campaignProducts.map(cp => cp.id)
    const t0 = Date.now()
    const allResults: RequestResult[] = []
    let done = 0

    // Bước 2: Chạy từng batch song song
    while (done < totalRequests) {
      const batchSize = Math.min(concurrency, totalRequests - done)
      const progress = 10 + Math.round((done / totalRequests) * 85)
      await onProgress(
        progress,
        `Đang gửi request ${done + 1}–${done + batchSize} / ${totalRequests}...`
      )

      // Tạo batchSize requests song song
      const batchResults = await Promise.allSettled(
        Array.from({ length: batchSize }, async (_, i) => {
          const reqIdx = done + i
          // Xoay vòng customers và campaign products
          const customer = customers[reqIdx % customers.length]
          const cpId = cpIds[reqIdx % cpIds.length]
          const idempotencyKey = `lt:${campaignId}:${
            customer.id
          }:${reqIdx}-${randomUUID().slice(0, 8)}`

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

      // Collect kết quả từ settled promises
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
