import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as amqplib from 'amqplib'
import { createId } from '@paralleldrive/cuid2'
import { LockStrategy } from '@prisma/client'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import { RETRY_HEADER } from '@infrastructure/rabbitmq/rabbitmq.constants'
import { RedisService } from '@infrastructure/redis/redis.service'
import { ReservationService } from '@modules/reservation/services/reservation.service'
import { ReservationRepository } from '@modules/reservation/repositories/reservation.repository'
import { StockAuditService } from '@modules/order/services/stock-audit.service'

/**
 * Interface mô tả cấu trúc một job trong RabbitMQ queue.
 * Được serialize/deserialize qua JSON — các field phải primitive-safe.
 */
interface OrderJob {
  requestId: string
  userId: string
  campaignProductId: string
  quantity: number
  idempotencyKey: string
  /** Unix timestamp lúc publish — dùng để detect stale jobs sau restart */
  timestamp: number
}

/**
 * OrderWorker — RabbitMQ consumer xử lý yêu cầu mua hàng bất đồng bộ
 *
 * [Context] Đây là component thực sự "quyết định" xem user có mua được hàng không.
 * Gateway (OrderGatewayService) chỉ validate và enqueue — Worker mới là nơi giảm tồn kho
 * và tạo reservation.
 *
 * [Why async worker thay vì xử lý trực tiếp trong Gateway?]
 * - Flash sale có burst traffic cực lớn: hàng ngàn request/giây trong vài giây đầu
 * - Worker xử lý tuần tự từ queue → kiểm soát concurrency chính xác
 * - Tách biệt concerns: Gateway lo validation/routing, Worker lo business logic
 * - RabbitMQ queue làm buffer, tránh DB/Redis bị overload
 *
 * [Queue architecture]
 * - order.high: xử lý trước, dành cho whitelisted users (VIP, early-access)
 * - order.normal: xử lý sau, dành cho tất cả users còn lại
 * Cả 2 queue đều dùng cùng processOrder() handler — phân biệt chỉ ở priority.
 *
 * [Critical path]
 * Redis Lua DECR stock → create Reservation (Redis + DB) → write result → SSE update
 *
 * [Rollback strategy]
 * Nếu tạo reservation thất bại sau khi đã DECR stock → phải INCR stock lại ngay lập tức
 * để tránh "phantom sold-out" (stock bị decrement nhưng không có reservation tương ứng).
 */
@Injectable()
export class OrderWorker implements OnModuleInit {
  private readonly logger = new Logger(OrderWorker.name)
  // Đồng bộ với DEFAULT_MAX_RETRIES trong RabbitMQService.
  // retryCount = 0..3 tương ứng tối đa 4 lần xử lý cùng một message.
  private readonly maxRetryCount = 3

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly redis: RedisService,
    private readonly reservationService: ReservationService,
    private readonly reservationRepository: ReservationRepository,
    private readonly stockAudit: StockAuditService
  ) {}

  /**
   * onModuleInit — Đăng ký consumers cho cả 2 queue khi module khởi động
   *
   * [Why] NestJS gọi onModuleInit sau khi DI container đã inject đủ dependencies.
   * Đây là thời điểm an toàn để start consuming vì các services đã sẵn sàng.
   *
   * [Design] Cả 2 queue dùng chung handler processOrder() — logic giống nhau,
   * khác nhau chỉ ở queue name (priority routing xảy ra phía Gateway + RabbitMQ config).
   */
  async onModuleInit(): Promise<void> {
    // HIGH priority queue: consumer count có thể được config cao hơn để xử lý nhanh hơn
    await this.rabbitmq.consume('order.high', msg => this.processOrder(msg))
    await this.rabbitmq.consume('order.normal', msg => this.processOrder(msg))
    this.logger.log(
      'Order Worker started — consuming order.high and order.normal'
    )
  }

  /**
   * processOrder — Xử lý một job mua hàng từ queue
   *
   * [Context] Được gọi bởi RabbitMQ consumer mỗi khi có message mới.
   * Đây là hàm critical nhất của toàn bộ flash sale flow.
   *
   * [Why Lua atomic DECR thay vì check-then-decrement?]
   * Nếu làm 2 bước riêng: GET stock → check > 0 → DECR stock,
   * có race window: 2 workers cùng GET stock=1, cùng thấy > 0, cùng DECR → stock = -1
   * (oversell — bán nhiều hơn tồn kho). Lua script thực thi atomic: không thể bị interleave.
   *
   * [Return codes từ Lua DECR]
   * - remaining >= 0: success, đây là số tồn kho còn lại sau khi trừ
   * - remaining < 0 (ví dụ -1): insufficient stock (đã sold out)
   * - remaining = -2: stock key không tồn tại trong Redis (campaign chưa được init)
   *
   * [How] Flow chính:
   * 1. Atomic DECR stock trong Redis
   * 2. Nếu thất bại (sold out / key missing): rollback purchase counter, write SOLD_OUT result
   * 3. Nếu thành công: tạo Reservation (write Redis trước, DB sau)
   * 4. Write kết quả RESERVED vào Redis để client poll được
   * 5. Publish event SSE cho dashboard real-time
   *
   * [Rollback on reservation failure]
   * Nếu createReservation() throw (DB lỗi, network timeout, v.v.), phải:
   * - INCR stock lại (hoàn trả lượng đã DECR)
   * - Nếu chưa phải lần retry cuối: throw để RabbitMQ retry
   * - Nếu là lần retry cuối: decrement purchase counter + ghi kết quả lỗi cuối cùng
   *   để user có thể gửi request mới thay vì bị kẹt quota
   *
   * @param msg - RabbitMQ ConsumeMessage, được ACK tự động bởi RabbitMQService sau khi handler return
   */
  private async processOrder(msg: amqplib.ConsumeMessage): Promise<void> {
    const job: OrderJob = JSON.parse(msg.content.toString())
    const { requestId, userId, campaignProductId, quantity, idempotencyKey } =
      job
    const currentRetryCount = Number(
      msg.properties.headers?.[RETRY_HEADER] ?? 0
    )
    const isFinalAttempt = currentRetryCount >= this.maxRetryCount

    this.logger.debug(
      `Processing order: requestId=${requestId}, user=${userId}`
    )

    // [Step 1] Atomic stock decrement via Lua script.
    // Lua script đảm bảo check-and-decrement là một operation duy nhất trong Redis,
    // không bị interleave bởi bất kỳ command Redis nào khác (single-threaded Redis + Lua).
    const luaStart = process.hrtime.bigint()
    const remaining = await this.redis.decrementStock(
      campaignProductId,
      quantity
    )
    const luaExecUs = Number(process.hrtime.bigint() - luaStart) / 1000

    if (remaining === -2) {
      // Stock key không tìm thấy trong Redis — xảy ra khi:
      // 1. Redis bị restart trong lúc campaign đang chạy (key bị mất)
      // 2. Campaign stock chưa được pre-load (hiếm — scheduler thường xử lý trước)
      //
      // Recovery flow: tái tạo key từ DB thay vì trả SOLD_OUT ngay lập tức.
      // Công thức: stock_thực_tế = saleQuantity - Σquantity(HOLDING + PAID reservations)
      // Dùng SET NX để race-safe: chỉ worker đầu tiên set được, worker khác retry DECR bình thường.
      this.logger.warn(
        `Stock key missing for product ${campaignProductId} — attempting Redis recovery from DB`
      )

      try {
        // Lấy saleQuantity và tổng quantity đã "chiếm giữ" từ DB
        const [campaignProduct, activeQuantity] = await Promise.all([
          this.reservationRepository.findCampaignProductById(campaignProductId),
          this.reservationRepository.sumActiveQuantityByCampaignProduct(
            campaignProductId
          )
        ])

        if (!campaignProduct) {
          // Sản phẩm không tồn tại trong DB — không thể phục hồi
          await this.redis.decrementPurchaseCount(
            campaignProductId,
            userId,
            quantity
          )
          await this.saveResult(requestId, idempotencyKey, {
            status: 'SOLD_OUT',
            reason: 'Sản phẩm không tồn tại'
          })
          return
        }

        const recoveredStock = Math.max(
          0,
          campaignProduct.saleQuantity - activeQuantity
        )

        if (recoveredStock <= 0) {
          // Tất cả hàng đã được reserve — không cần restore key, báo SOLD_OUT
          await this.redis.decrementPurchaseCount(
            campaignProductId,
            userId,
            quantity
          )
          await this.saveResult(requestId, idempotencyKey, {
            status: 'SOLD_OUT',
            reason: 'Sản phẩm đã hết hàng'
          })
          return
        }

        // Tái tạo key bằng SET NX — race-safe, chỉ 1 worker set được
        const wasSet = await this.redis.initStockIfMissing(
          campaignProductId,
          recoveredStock
        )
        this.logger.log(
          `Stock key recovered for ${campaignProductId}: ${recoveredStock} units (${
            wasSet ? 'set by this worker' : 'already set by another worker'
          })`
        )

        // Retry DECR sau khi key đã được phục hồi (bởi worker này hoặc worker khác)
        const retryRemaining = await this.redis.decrementStock(
          campaignProductId,
          quantity
        )

        if (retryRemaining < 0) {
          // Không còn hàng sau recovery
          await this.redis.decrementPurchaseCount(
            campaignProductId,
            userId,
            quantity
          )
          await this.saveResult(requestId, idempotencyKey, {
            status: 'SOLD_OUT',
            reason: 'Sản phẩm đã hết hàng'
          })
          return
        }

        // Thành công — tiếp tục flow tạo reservation bên dưới với retryRemaining
        // Ghi đè biến `remaining` để code phía dưới dùng giá trị đúng
        // Dùng block scope để tránh reassign const — xem xử lý bên dưới
        return await this.handleSuccessfulDecrement(
          retryRemaining,
          job,
          isFinalAttempt,
          luaExecUs
        )
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Lỗi không xác định'
        this.logger.error(
          `Stock recovery failed for ${campaignProductId}: ${message}`
        )
        // Recovery thất bại — hoàn trả counter và báo lỗi tạm thời
        await this.redis.decrementPurchaseCount(
          campaignProductId,
          userId,
          quantity
        )
        await this.saveResult(requestId, idempotencyKey, {
          status: 'SOLD_OUT',
          reason: 'Lỗi hệ thống, vui lòng thử lại'
        })
        return
      }
    }

    if (remaining < 0) {
      // Tồn kho không đủ — sold out. remaining có thể âm nếu nhiều workers
      // cùng decrement đồng thời và một trong số đó "thắng" cái slot cuối cùng.
      // Rollback purchase counter để user có thể thử mua sản phẩm khác hoặc lần sau.
      await this.redis.decrementPurchaseCount(
        campaignProductId,
        userId,
        quantity
      )
      const result = { status: 'SOLD_OUT', reason: 'Sản phẩm đã hết hàng' }
      await this.saveResult(requestId, idempotencyKey, result)
      this.logger.log(`SOLD_OUT: campaignProductId=${campaignProductId}`)
      return
    }

    // remaining >= 0 → DECR thành công, tiếp tục flow tạo reservation
    await this.handleSuccessfulDecrement(
      remaining,
      job,
      isFinalAttempt,
      luaExecUs
    )
  }

  /**
   * handleSuccessfulDecrement — Xử lý sau khi DECR stock thành công (remaining >= 0).
   *
   * Được gọi từ:
   * 1. Normal flow — DECR trực tiếp thành công
   * 2. Recovery flow — DECR sau khi khôi phục Redis key từ DB
   *
   * Bao gồm: audit log, tạo reservation, lưu kết quả, publish dashboard update.
   *
   * @param remaining    - Số tồn kho còn lại sau DECR
   * @param job          - Job đang xử lý
   * @param isFinalAttempt - true nếu đây là lần thử cuối (tối đa retry)
   * @param luaExecUs    - Thời gian thực thi Lua DECR (microseconds) cho audit log
   */
  private async handleSuccessfulDecrement(
    remaining: number,
    job: OrderJob,
    isFinalAttempt: boolean,
    luaExecUs: number
  ): Promise<void> {
    const { requestId, userId, campaignProductId, quantity, idempotencyKey } =
      job

    // [Step 1b] Record audit log for successful DECR (fire-and-forget, không await throw)
    void this.stockAudit.record({
      productId: campaignProductId,
      delta: -quantity,
      stockBefore: remaining + quantity,
      stockAfter: remaining,
      reason: 'PURCHASE',
      referenceId: requestId,
      triggeredBy: userId,
      strategy: LockStrategy.REDIS_LUA,
      executionTimeUs: Math.round(luaExecUs)
    })

    // [Step 2] Stock decrement thành công — tạo Reservation.
    const reservationId = createId()

    try {
      await this.reservationService.createReservation({
        id: reservationId,
        customerId: userId,
        campaignProductId,
        quantity,
        idempotencyKey
      })
    } catch (err: unknown) {
      // [Rollback] Reservation creation thất bại → INCR stock lại để tránh phantom sold-out.
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      this.logger.error(
        `Failed to create reservation for requestId=${requestId}: ${message}`
      )
      await this.redis.incrementStock(campaignProductId, quantity)

      if (isFinalAttempt) {
        await this.redis.decrementPurchaseCount(
          campaignProductId,
          userId,
          quantity
        )
        await this.saveResult(requestId, idempotencyKey, {
          status: 'SOLD_OUT',
          reason: 'Lỗi hệ thống, vui lòng thử lại'
        })
        return
      }

      throw err
    }

    // [Step 2b] Lưu kết quả RESERVED để client poll được
    const expiredAt = new Date(Date.now() + 10 * 60 * 1000)
    const result = {
      status: 'RESERVED',
      reservationId,
      expiredAt: expiredAt.toISOString()
    }

    try {
      await this.saveResult(requestId, idempotencyKey, result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      this.logger.warn(
        `Không thể lưu purchase result cho requestId=${requestId}: ${message}`
      )
    }

    // [Step 2c] Publish event lên Redis Pub/Sub để dashboard cập nhật real-time
    try {
      await this.publishDashboardUpdate(campaignProductId, remaining)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      this.logger.warn(
        `Không thể publish dashboard update cho requestId=${requestId}: ${message}`
      )
    }

    this.logger.log(
      `RESERVED: reservationId=${reservationId}, remaining=${remaining}`
    )
  }

  /**
   * saveResult — Ghi kết quả xử lý vào Redis theo 2 key khác nhau
   *
   * [Why 2 keys?]
   * - result:{requestId}: client poll bằng requestId từ Gateway response
   * - idempotency key result: đảm bảo nếu client gửi lại request với cùng idempotencyKey,
   *   sẽ nhận được cùng kết quả (replay-safe)
   *
   * Cả 2 key đều cần để đảm bảo:
   * 1. Client đang poll requestId hiện tại nhận được kết quả
   * 2. Client retry với idempotencyKey cũ nhận được kết quả cũ (idempotency guarantee)
   */
  private async saveResult(
    requestId: string,
    idempotencyKey: string,
    result: object
  ): Promise<void> {
    const maxAttempts = 3
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.redis.setPurchaseResult(requestId, result)
        await this.redis.setPurchaseFinalResultByIdempotency(
          idempotencyKey,
          result
        )
        return
      } catch (err: unknown) {
        lastError = err
        if (attempt < maxAttempts) {
          await wait(100 * attempt)
          continue
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Không thể lưu purchase result vào Redis')
  }

  /**
   * publishDashboardUpdate — Gửi event cập nhật tồn kho lên SSE dashboard
   *
   * [Context] Merchant dashboard hiển thị thanh tiến độ stock real-time.
   * Mỗi lần có order thành công, dashboard cần biết số tồn kho còn lại.
   *
   * [Why không publish trực tiếp từ processOrder?]
   * Tách ra method riêng để:
   * 1. Fetch campaignId (cần cho Redis pub/sub channel key)
   * 2. Giữ processOrder() gọn và dễ đọc
   *
   * [Edge case] Nếu campaign product không tìm thấy trong DB (hiếm, nhưng có thể xảy ra
   * trong quá trình migration data), bỏ qua publish thay vì throw.
   * Dashboard miss 1 update không nghiêm trọng bằng việc làm fail cả order flow.
   */
  /**
   * publishDashboardUpdate — Gửi event cập nhật tồn kho lên Redis Pub/Sub
   *
   * Payload được publish lên channel dashboard:{campaignId}.
   * StockGateway đang subscribe channel này và sẽ forward đến Socket.IO clients
   * đang theo dõi campaign tương ứng (theo cơ chế room).
   *
   * Payload bao gồm campaignProductId và stockRatio để:
   * - Frontend có thể cập nhật đúng product (một campaign có thể có nhiều sản phẩm)
   * - Hiển thị thanh tiến độ stock dưới dạng tỷ lệ phần trăm (không cần biết saleQuantity)
   *
   * Edge case: nếu không tìm thấy campaign product → bỏ qua, không throw.
   * Dashboard miss 1 update không nghiêm trọng bằng việc fail cả order flow.
   */
  private async publishDashboardUpdate(
    campaignProductId: string,
    stockRemaining: number
  ): Promise<void> {
    const cp = await this.reservationRepository.findCampaignProductById(
      campaignProductId
    )
    if (!cp) return

    // Tính stockRatio để frontend hiển thị thanh tiến độ trực tiếp
    const stockRatio =
      cp.saleQuantity > 0 ? stockRemaining / cp.saleQuantity : 0

    await this.redis.publishDashboardEvent(cp.campaignId, {
      type: 'STOCK_UPDATE',
      campaignProductId, // cần để gateway route đúng đến frontend component
      stockRemaining,
      stockTotal: cp.saleQuantity,
      stockRatio, // frontend dùng trực tiếp, không cần tính lại
      timestamp: new Date().toISOString()
    })
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}
