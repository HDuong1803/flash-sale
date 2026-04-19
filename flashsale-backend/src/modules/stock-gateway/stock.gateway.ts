import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import Redis from 'ioredis'
import { ConfigService } from '@nestjs/config'

// ─── Kiểu dữ liệu ────────────────────────────────────────────────────────────

/** Payload gửi về client khi tồn kho thay đổi */
interface StockUpdatePayload {
  campaignProductId: string
  /** Số lượng tồn kho còn lại (lấy từ Redis) */
  stockRemaining: number
  /** Tỷ lệ tồn kho so với ban đầu (0–1) */
  stockRatio: number
  /** Nguồn gốc sự kiện */
  source: 'PURCHASE' | 'MANUAL'
  timestamp: string
}

/** Sự kiện dashboard từ Redis Pub/Sub */
interface DashboardEvent {
  type: 'STOCK_UPDATE' | 'ORDER_STATUS'
  campaignProductId?: string
  [key: string]: unknown
}

// ─── Hằng số ─────────────────────────────────────────────────────────────────

/** Prefix channel Redis Pub/Sub: dashboard:{campaignId} */
const DASHBOARD_CHANNEL_PATTERN = 'dashboard:*'

/** Tên room Socket.IO mỗi campaign: client join để nhận update */
const campaignRoom = (campaignId: string) => `campaign:${campaignId}`

/**
 * Stock Gateway — WebSocket server quản lý kết nối real-time.
 *
 * Kiến trúc tổng thể:
 *   OrderWorker (DECR stock) → Redis Pub/Sub (channel dashboard:{campaignId})
 *   ↓
 *   StockGateway (subscriber Redis) → emit socket event → Browser client
 *
 * Cơ chế room:
 * - Client join vào room `campaign:{campaignId}` để chỉ nhận update của campaign đó
 * - Một client có thể join nhiều room (xem nhiều campaign)
 * - Khi Redis nhận message → gateway emit đến đúng room → chỉ client quan tâm nhận
 *
 * Khả năng mở rộng:
 * - @socket.io/redis-adapter có thể được thêm để đồng bộ giữa nhiều pod
 * - Subscriber Redis dùng instance riêng (không chia sẻ với RedisService)
 *   vì Redis subscriber không thể dùng cho command thông thường
 */
@WebSocketGateway({
  cors: {
    // Dùng origin: true để phản chiếu lại origin của request thay vì dùng '*'
    // Lý do: `origin: '*'` + `credentials: true` bị browser từ chối theo CORS spec
    // origin: true → header `Access-Control-Allow-Origin` = origin thực của request
    origin: true,
    credentials: true
  },
  namespace: '/ws', // Socket.IO namespace để tránh xung đột với HTTP routes
  transports: ['websocket', 'polling'] // polling fallback nếu websocket bị chặn
})
export class StockGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  private readonly server: Server

  private readonly logger = new Logger(StockGateway.name)

  /** Redis subscriber riêng — một connection chuyên subscribe, không dùng cho command */
  private subscriber: Redis

  constructor(private readonly configService: ConfigService) {}

  // ─── Lifecycle hooks ──────────────────────────────────────────────────────

  /**
   * Khởi tạo Redis subscriber khi module load.
   * Dùng connection riêng vì Redis ở chế độ subscribe không thể chạy lệnh khác.
   */
  async onModuleInit(): Promise<void> {
    this.subscriber = new Redis({
      host: this.configService.get<string>('redis.REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('redis.REDIS_PORT', 6379),
      username: this.configService.get<string>(
        'redis.REDIS_USERNAME',
        'default'
      ),
      password: this.configService.get<string>('redis.REDIS_PASSWORD', 'pass'),
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      retryStrategy: (times: number) => {
        if (times > 10) return null // dừng thử lại sau 10 lần
        return Math.min(times * 200, 30_000)
      }
    })

    // Đăng ký handler trước khi subscribe để không bị miss message
    this.subscriber.on('pmessage', this.handleRedisMessage.bind(this))
    this.subscriber.on('error', (err: Error) => {
      this.logger.error(`Redis subscriber lỗi: ${err.message}`)
    })

    // psubscribe = subscribe theo pattern (wildcard), nhận tất cả dashboard:*
    await this.subscriber.psubscribe(DASHBOARD_CHANNEL_PATTERN)
    this.logger.log(
      `Stock gateway đang lắng nghe Redis channel: ${DASHBOARD_CHANNEL_PATTERN}`
    )
  }

  /** Đóng Redis subscriber khi module destroy (graceful shutdown) */
  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.punsubscribe()
    await this.subscriber?.quit()
    this.logger.log('Stock gateway: Redis subscriber đã đóng')
  }

  // ─── Socket.IO connection handlers ───────────────────────────────────────

  /**
   * Xử lý khi client kết nối vào WebSocket.
   * Log để debug, không join room tự động (client phải gửi event 'subscribe').
   */
  handleConnection(client: Socket): void {
    this.logger.debug(
      `Client kết nối: ${client.id} | Transport: ${client.conn.transport.name}`
    )
  }

  /**
   * Xử lý khi client ngắt kết nối.
   * Socket.IO tự dọn dẹp room membership — không cần xử lý thủ công.
   */
  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client ngắt kết nối: ${client.id}`)
  }

  // ─── Socket.IO event handlers (nhận từ client) ───────────────────────────

  /**
   * Client đăng ký nhận update của một campaign cụ thể.
   *
   * Client gửi: { campaignId: "abc123" }
   * Server: join client vào room campaign:abc123
   * Từ đây client sẽ nhận tất cả sự kiện stock:update và price:update của campaign này
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { campaignId: string }
  ): Promise<void> {
    const { campaignId } = data

    if (!campaignId || typeof campaignId !== 'string') {
      client.emit('error', { message: 'campaignId không hợp lệ' })
      return
    }

    await client.join(campaignRoom(campaignId))
    this.logger.debug(`Client ${client.id} đã subscribe campaign ${campaignId}`)

    // Xác nhận client đã subscribe thành công
    client.emit('subscribed', {
      campaignId,
      message: `Đã đăng ký nhận cập nhật real-time cho campaign ${campaignId}`
    })
  }

  /**
   * Client huỷ đăng ký nhận update của một campaign.
   *
   * Client gửi: { campaignId: "abc123" }
   * Server: rời khỏi room campaign:abc123
   */
  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { campaignId: string }
  ): Promise<void> {
    const { campaignId } = data
    await client.leave(campaignRoom(campaignId))
    this.logger.debug(
      `Client ${client.id} đã unsubscribe campaign ${campaignId}`
    )
  }

  // ─── Redis Pub/Sub handler ────────────────────────────────────────────────

  /**
   * Nhận message từ Redis Pub/Sub và chuyển tiếp đến đúng room Socket.IO.
   *
   * Format channel: dashboard:{campaignId}
   * Format message: JSON string của DashboardEvent
   *
   * Routing theo type:
   * - STOCK_UPDATE → emit 'stock:update' với StockUpdatePayload
   * - PRICE_UPDATE → emit 'price:update' với PriceUpdatePayload
   * - Loại khác → emit 'campaign:event' với raw payload (forward all)
   *
   * Lỗi parse JSON hoặc format không hợp lệ → log warn, bỏ qua (không throw)
   */
  private handleRedisMessage(
    _pattern: string,
    channel: string,
    message: string
  ): void {
    // Trích xuất campaignId từ channel name: "dashboard:abc123" → "abc123"
    const campaignId = channel.replace('dashboard:', '')

    let event: DashboardEvent
    try {
      event = JSON.parse(message) as DashboardEvent
    } catch {
      this.logger.warn(
        `Không thể parse message từ Redis channel ${channel}: ${message}`
      )
      return
    }

    const room = campaignRoom(campaignId)

    // Phân loại sự kiện và emit đến đúng room
    switch (event.type) {
      case 'STOCK_UPDATE': {
        const payload: StockUpdatePayload = {
          campaignProductId: event.campaignProductId ?? '',
          stockRemaining: Number(event.stockRemaining ?? 0),
          stockRatio: Number(event.stockRatio ?? 0),
          source: 'PURCHASE',
          timestamp: String(event.timestamp ?? new Date().toISOString())
        }
        this.server.to(room).emit('stock:update', payload)
        break
      }

      default:
        // Forward các loại event khác (ORDER_STATUS, v.v.) để frontend linh hoạt
        this.server.to(room).emit('campaign:event', event)
        break
    }
  }

  // ─── Phương thức public để các module khác emit event ────────────────────

  /**
   * Emit sự kiện cập nhật tồn kho đến tất cả client đang theo dõi campaign.
   * Được gọi từ OrderWorker sau khi DECR stock Redis thành công.
   *
   * @param campaignId - ID campaign để xác định room Socket.IO
   * @param payload - Thông tin tồn kho mới
   */
  emitStockUpdate(campaignId: string, payload: StockUpdatePayload): void {
    this.server.to(campaignRoom(campaignId)).emit('stock:update', payload)
    this.logger.debug(
      `Emit stock:update → room ${campaignRoom(campaignId)}: còn ${
        payload.stockRemaining
      }`
    )
  }
}
