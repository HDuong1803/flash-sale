import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { CampaignStatus, OrderStatus, UserRole } from '@prisma/client'
import { createId } from '@paralleldrive/cuid2'
import { RedisService } from '@infrastructure/redis/redis.service'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import { OrderRepository } from '../repositories/order.repository'

/**
 * OrderGatewayService — Cổng vào duy nhất của luồng mua hàng Flash Sale
 *
 * [Context] Đây là điểm tiếp nhận mọi yêu cầu mua hàng từ client (POST /orders/purchase).
 * Service này KHÔNG xử lý trực tiếp việc giữ tồn kho — thay vào đó nó xác thực đầu vào,
 * bảo vệ hệ thống khỏi request trùng lặp và gian lận, rồi đẩy job vào RabbitMQ queue
 * để Order Worker xử lý bất đồng bộ.
 *
 * [Why] Thiết kế async 2 bước (Gateway → Worker) giải quyết vấn đề thundering herd:
 * hàng ngàn user cùng nhấn "Mua" đồng thời không làm crash DB/Redis vì mỗi request
 * chỉ cần vài lệnh Redis nhanh rồi enqueue, không block.
 *
 * [Flow tổng thể]
 * 1. Kiểm tra idempotency key → tránh double-submission từ cùng một client
 * 2. Validate campaign đang ACTIVE
 * 3. Atomic INCR per-user limit counter trong Redis → ngăn race condition vượt giới hạn
 * 4. Route vào queue ưu tiên cao/thấp dựa trên whitelist
 * 5. Claim idempotency key bằng SET NX → đảm bảo chỉ 1 concurrent request được xử lý
 * 6. Publish message lên RabbitMQ → trả về requestId ngay (202 Accepted pattern)
 *
 * [Dependencies]
 * - OrderRepository: đọc campaign/product từ DB, tìm reservation đang HOLDING
 * - RedisService: idempotency, per-user counter, whitelist, result cache
 * - RabbitMQService: publish job lên queue
 */
@Injectable()
export class OrderGatewayService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService
  ) {}

  /**
   * purchase — Tiếp nhận yêu cầu mua hàng và enqueue để xử lý bất đồng bộ
   *
   * [Context] Entry point của luồng mua hàng. Được gọi từ OrderController (POST /orders/purchase).
   * Nhận idempotencyKey từ header X-Idempotency-Key do client gửi kèm.
   *
   * [Why] Trả về requestId ngay lập tức thay vì chờ kết quả:
   * - Client poll GET /orders/result/:requestId để lấy kết quả cuối cùng
   * - Hệ thống không bị block khi có spike traffic (flash sale thường có 10x-100x burst)
   *
   * [How] 6 bước với 2 tầng bảo vệ chính:
   *   - Tầng 1 (trước queue): idempotency + per-user limit + whitelist routing
   *   - Tầng 2 (claim atomic): SET NX đảm bảo không có race window giữa check và enqueue
   *
   * [Edge cases]
   * - Client retry cùng idempotencyKey: trả về requestId cũ (không xử lý lại)
   * - Concurrent requests với cùng key: chỉ 1 request được claim key, request còn lại bị reject
   * - RabbitMQ publish fail: rollback idempotency key + decrement counter
   * - User đã có HOLDING reservation: trả lỗi có chứa reservationId để client redirect thẳng đến checkout
   */
  async purchase(
    userId: string,
    dto: { campaignProductId: string; quantity: number },
    idempotencyKey: string
  ): Promise<{ requestId: string }> {
    // [Step 1] Kiểm tra idempotency — trả về kết quả cũ nếu request này đã được xử lý trước đó.
    // Đây là bảo vệ đầu tiên chống double-submission (ví dụ: user bấm nhanh 2 lần, network retry).
    // Key có TTL 5 phút, được set trong bước 5 sau khi claim thành công.
    const cachedRequestId = await this.redis.getPurchaseRequestIdempotency(
      idempotencyKey
    )
    if (cachedRequestId) return { requestId: cachedRequestId }

    // [Step 2] Kiểm tra campaign đang ACTIVE.
    // Lấy đầy đủ thông tin campaign để dùng cho bước 3 (TTL tính per-user limit).
    // Throw sớm trước khi chạm vào bất kỳ write Redis nào để tránh rollback không cần thiết.
    const cp = await this.orderRepository.findCampaignProductWithCampaign(
      dto.campaignProductId
    )
    if (!cp) throw new BadRequestException('Sản phẩm không tồn tại')
    if (cp.campaign.status !== CampaignStatus.ACTIVE)
      throw new BadRequestException('Flash Sale chưa bắt đầu hoặc đã kết thúc')

    // [Step 3] Atomic INCRBY per-user purchase counter — chống race condition vượt giới hạn mua.
    //
    // Vấn đề nếu không dùng atomic: 2 request song song cùng đọc counter=0, cùng thấy < limit,
    // cùng increment → counter lên 2 dù limit=1 (TOCTOU race condition).
    //
    // Giải pháp: Lua script trong Redis thực hiện CHECK + INCRBY(quantity)
    // như một lệnh duy nhất,
    // không thể bị interleave bởi lệnh Redis khác.
    //
    // TTL = thời gian còn lại của campaign (tối thiểu 60 giây) hoặc 24h nếu không có endTime.
    // Mục đích TTL: counter tự hết hạn khi campaign kết thúc → user có thể mua campaign mới.
    const campaignEndTime = cp.campaign.endTime
    const ttlSeconds = campaignEndTime
      ? Math.max(Math.ceil((campaignEndTime.getTime() - Date.now()) / 1000), 60)
      : 86400
    const newCount = await this.redis.incrementPurchaseCount(
      dto.campaignProductId,
      userId,
      dto.quantity,
      cp.perUserLimit,
      ttlSeconds
    )

    if (newCount === -1) {
      // Lua script trả -1 nghĩa là đã đạt giới hạn (counter >= perUserLimit).
      // Phân biệt 2 trường hợp: user đang có HOLDING reservation (hướng dẫn checkout)
      // vs. user thực sự đã mua đủ (từ chối).
      const existingReservation =
        await this.orderRepository.findHoldingReservation(
          userId,
          dto.campaignProductId
        )
      if (existingReservation) {
        // Trả lỗi có structure JSON để client parse và redirect đến trang thanh toán.
        // Thiết kế này tránh user bị "mắc kẹt" — họ đã giữ chỗ nhưng chưa thanh toán.
        throw new BadRequestException(
          JSON.stringify({
            code: 'RESERVATION_EXISTS',
            message: 'Bạn đã có đơn đặt chỗ chưa thanh toán cho sản phẩm này',
            reservationId: existingReservation.id,
            expiredAt: existingReservation.expiredAt.toISOString()
          })
        )
      }
      throw new BadRequestException(
        `Bạn chỉ được mua tối đa ${cp.perUserLimit} sản phẩm`
      )
    }

    // [Step 4] Xác định queue ưu tiên dựa trên whitelist.
    // Whitelist (ví dụ: VIP customers, early-access users) được pre-populate vào Redis SET
    // trước khi campaign bắt đầu. Họ vào queue 'order.high' để được xử lý trước.
    // Lý do: Flash Sale thường có đối tác hoặc KOL được ưu tiên mà không cần thay đổi business logic.
    const isWhitelisted = await this.redis.isWhitelisted(cp.campaignId, userId)
    const queue = isWhitelisted ? 'order.high' : 'order.normal'

    // [Step 5] Tạo requestId và atomic claim idempotency key bằng SET NX.
    //
    // Tại sao cần claim riêng thay vì chỉ dùng check ở Step 1?
    // Step 1 chỉ là READ check — có race window giữa read và write.
    // Step 5 dùng SET NX (SET if Not eXists) để atomic claim: chỉ 1 trong nhiều
    // concurrent request với cùng key có thể thành công, những request còn lại bị từ chối.
    //
    // TTL = 300 giây (5 phút) — đủ thời gian cho worker xử lý và write result.
    const requestId = createId()
    const claimed = await this.redis.claimPurchaseRequestIdempotency(
      idempotencyKey,
      requestId,
      300
    )

    if (!claimed) {
      // Key đã tồn tại — một concurrent request khác đã claim trước (trong vài milliseconds).
      // Rollback: hoàn trả counter đã increment ở Step 3 trước khi từ chối request này.
      await this.redis.decrementPurchaseCount(
        dto.campaignProductId,
        userId,
        dto.quantity
      )

      // Cố gắng trả về requestId của request đã claim thành công (best-effort).
      const existingRequestId = await this.redis.getPurchaseRequestIdempotency(
        idempotencyKey
      )
      if (existingRequestId) return { requestId: existingRequestId }

      // Cực kỳ hiếm: key expire ngay sau khi claim fail (TTL rất ngắn hoặc Redis eviction).
      // Trong trường hợp này buộc phải báo lỗi — client cần retry với key mới.
      throw new BadRequestException('Request trùng lặp — vui lòng thử lại')
    }

    // [Step 6] Đẩy job vào RabbitMQ queue. Idempotency key đã được claim atomic ở Step 5.
    // Timestamp giúp worker detect stale messages (nếu worker restart sau khi queue tồn đọng lâu).
    const published = await this.rabbitmq.publish(queue, {
      requestId,
      userId,
      campaignProductId: dto.campaignProductId,
      quantity: dto.quantity,
      idempotencyKey,
      timestamp: Date.now()
    })

    if (!published) {
      // Publish thất bại (RabbitMQ down, connection timeout, v.v.).
      // Rollback chain: expire idempotency key ngay lập tức (TTL=1 giây) + hoàn trả counter.
      // Không xóa key trực tiếp vì atomic SET NX đã claim — set TTL=1 là cách an toàn nhất.
      await this.redis.setPurchaseRequestIdempotency(idempotencyKey, '', 1) // expire ngay
      await this.redis.decrementPurchaseCount(
        dto.campaignProductId,
        userId,
        dto.quantity
      )
      throw new BadRequestException(
        'Hệ thống đang quá tải, vui lòng thử lại sau'
      )
    }

    // Lưu mapping requestId → userId để getResult() có thể kiểm tra quyền truy cập.
    // TTL = 24h: đủ thời gian cho user poll kết quả, sau đó tự dọn.
    await this.redis.setPurchaseRequestOwner(requestId, userId, 86400)

    return { requestId }
  }

  /**
   * getResult — Polling endpoint để client kiểm tra kết quả xử lý đơn hàng
   *
   * [Context] Client gọi GET /orders/result/:requestId sau khi nhận requestId từ purchase().
   * Worker sẽ write kết quả vào Redis khi xử lý xong, endpoint này chỉ đọc cache.
   *
   * [Why] Pattern polling thay vì WebSocket/SSE cho kết quả mua hàng vì:
   * - Client dễ implement hơn (simple retry loop)
   * - Không cần duy trì connection trong suốt quá trình xử lý
   * - Worker write 1 lần, client đọc nhiều lần không ảnh hưởng hiệu năng
   *
   * [Security] Kiểm tra owner trước khi trả kết quả để ngăn user A xem kết quả của user B.
   * Nếu ownerUserId không tồn tại trong Redis (key expire), bỏ qua kiểm tra (permissive fallback).
   */
  async getResult(
    requestId: string,
    requestingUserId: string
  ): Promise<object> {
    // Kiểm tra quyền sở hữu: requestId này có thuộc về requestingUserId không?
    // ownerUserId = null nếu key đã expire → cho phép truy cập (fail-open để không block user hợp lệ)
    const ownerUserId = await this.redis.getPurchaseRequestOwner(requestId)
    if (ownerUserId && ownerUserId !== requestingUserId) {
      throw new ForbiddenException(
        'Không có quyền truy cập yêu cầu mua hàng này'
      )
    }

    // Kết quả do Worker ghi vào Redis sau khi xử lý xong.
    // null = worker chưa xử lý xong (hoặc requestId không tồn tại) → trả PROCESSING
    const result = await this.redis.getPurchaseResult(requestId)
    if (!result) return { status: 'PROCESSING' }
    return result
  }

  /**
   * getMyOrders — Lấy danh sách đơn hàng cá nhân của user hiện tại (với tư cách customer)
   *
   * [Context] Được gọi từ GET /orders với filter và pagination.
   *
   * [Why] Endpoint GET /orders luôn trả đơn hàng mà user ĐÃ ĐẶT với tư cách customer,
   * bất kể role. Merchant muốn xem đơn của shop mình thì dùng GET /merchants/orders.
   * Điều này tránh trường hợp merchant đăng nhập rồi vào trang "Đơn hàng của tôi"
   * lại thấy toàn bộ đơn của khách hàng khác đặt vào shop của họ.
   */
  async getMyOrders(
    userId: string,
    _role: string,
    query: { status?: OrderStatus; page?: number; limit?: number }
  ) {
    const filters = {
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 10
    }

    // Luôn lấy đơn hàng mà user này đặt (customer view), không phân biệt role
    return this.orderRepository.findAllForCustomer(userId, filters)
  }

  /**
   * getOrderById — Lấy chi tiết một đơn hàng với kiểm tra quyền truy cập
   *
   * [Context] Được gọi từ GET /orders/:id. Phục vụ 3 role khác nhau với logic access control khác nhau.
   *
   * [Why] Thay vì nhiều endpoint riêng cho mỗi role, dùng chung 1 endpoint với authorization logic
   * trong service để giảm code duplication và giữ API surface gọn.
   *
   * [Access control logic]
   * - ADMIN: full access, không cần kiểm tra ownership
   * - CUSTOMER: chỉ xem đơn hàng của chính mình (order.customerId === userId)
   * - MERCHANT: xem đơn hàng thuộc shop của mình (verify qua merchantId join)
   * Mọi trường hợp còn lại → ForbiddenException
   */
  async getOrderById(orderId: string, userId: string, role: string) {
    const order = await this.orderRepository.findById(orderId)
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại')

    // ADMIN bypass tất cả access control
    if (role === UserRole.ADMIN) return order

    // CUSTOMER chỉ xem đơn của chính mình
    if (order.customerId === userId) return order

    // MERCHANT: kiểm tra đơn hàng có thuộc merchant của userId không.
    // Cần join qua bảng merchant vì userId != merchantId (userId là account, merchantId là profile).
    if (role === UserRole.MERCHANT) {
      const merchant =
        await this.orderRepository.findMerchantByUserIdAndOrderMerchantId(
          userId,
          order.merchantId
        )
      if (merchant) return order
    }

    throw new ForbiddenException('Không có quyền truy cập đơn hàng này')
  }
}
