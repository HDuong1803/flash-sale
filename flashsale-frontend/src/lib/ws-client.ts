/**
 * ws-client.ts — WebSocket client singleton dùng Socket.IO
 *
 * Tại sao singleton?
 * - Toàn bộ app chỉ cần một connection duy nhất tới server
 * - Tránh mở nhiều connection song song từ các component khác nhau
 * - Auto-reconnect được quản lý tập trung, không bị duplicate
 *
 * Cơ chế room:
 * - Backend dùng room `campaign:{campaignId}` để nhóm clients
 * - Client phải gửi event 'subscribe' + { campaignId } để join room
 * - Sau khi join, client nhận 'stock:update' và 'price:update' chỉ cho campaign đó
 *
 * Graceful cleanup:
 * - Mỗi caller nhận về hàm disconnect() riêng để cleanup
 * - Hook useStockSocket() gọi cleanup trong useEffect cleanup function
 */

import { io, Socket } from 'socket.io-client'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Payload nhận được khi tồn kho thay đổi */
export interface StockUpdatePayload {
  campaignProductId: string
  stockRemaining: number
  stockRatio: number
  source: 'PURCHASE' | 'PRICE_UPDATE' | 'MANUAL'
  timestamp: string
}

/** Payload nhận được khi giá thay đổi */
export interface PriceUpdatePayload {
  campaignProductId: string
  oldPrice: number
  newPrice: number
  reason: string
  timestamp: string
}

// ─── Singleton state ────────────────────────────────────────────────────────────

/** Instance Socket.IO duy nhất, lazy-initialized */
let socket: Socket | null = null

/**
 * Lấy hoặc tạo mới Socket.IO connection.
 * Nếu đã có instance và đang connected → trả về ngay.
 * Ngược lại → tạo mới và kết nối.
 *
 * URL được đọc từ env NEXT_PUBLIC_WS_URL (fallback: localhost:3000).
 * Namespace '/ws' phải khớp với @WebSocketGateway({ namespace: '/ws' }) ở backend.
 */
function getSocket(): Socket {
  if (socket?.connected) return socket

  const url = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3000'

  socket = io(`${url}/ws`, {
    // polling trước, upgrade lên websocket nếu supported
    transports: ['websocket', 'polling'],
    // Cấu hình auto-reconnect: tối đa 5 lần, delay tăng dần exponential
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    // Timeout kết nối ban đầu
    timeout: 5000
  })

  socket.on('connect', () => {
    // Log để debug connection lifecycle — không phải console.log để production
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[WS] Connected:', socket?.id)
    }
  })

  socket.on('disconnect', (reason) => {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[WS] Disconnected:', reason)
    }
  })

  socket.on('connect_error', (err) => {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[WS] Connection error:', err.message)
    }
  })

  return socket
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Subscribe nhận update của một campaign cụ thể.
 *
 * Flow:
 * 1. Lấy/tạo socket connection
 * 2. Gửi event 'subscribe' để join room campaign:{campaignId}
 * 3. Đăng ký handler cho 'stock:update' và 'price:update'
 * 4. Trả về hàm cleanup để caller gọi khi unmount
 *
 * @param campaignId - ID campaign cần theo dõi
 * @param onStockUpdate - Callback khi tồn kho thay đổi
 * @param onPriceUpdate - Callback khi giá thay đổi (optional)
 * @returns Hàm cleanup để unsubscribe và remove listeners
 */
export function subscribeToCamera(
  campaignId: string,
  onStockUpdate: (payload: StockUpdatePayload) => void,
  onPriceUpdate?: (payload: PriceUpdatePayload) => void
): () => void {
  const sock = getSocket()

  // Join room của campaign này trên server
  const joinRoom = () => {
    sock.emit('subscribe', { campaignId })
  }

  // Nếu đã connected → join ngay; nếu chưa → đợi connect event
  if (sock.connected) {
    joinRoom()
  } else {
    sock.once('connect', joinRoom)
  }

  // Đăng ký listener nhận stock update
  sock.on('stock:update', onStockUpdate)

  // Đăng ký listener nhận price update nếu caller quan tâm
  if (onPriceUpdate) {
    sock.on('price:update', onPriceUpdate)
  }

  // Trả về hàm cleanup để caller gọi khi component unmount
  return () => {
    sock.emit('unsubscribe', { campaignId })
    sock.off('stock:update', onStockUpdate)
    if (onPriceUpdate) {
      sock.off('price:update', onPriceUpdate)
    }
    // Xóa connect listener nếu chưa fired
    sock.off('connect', joinRoom)
  }
}

/**
 * Kiểm tra trạng thái kết nối hiện tại của socket.
 * Dùng để hiển thị indicator "Đang cập nhật trực tiếp" / "Đang kết nối...".
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false
}

/**
 * Lắng nghe thay đổi trạng thái kết nối.
 * Trả về hàm cleanup để remove listener.
 */
export function onConnectionChange(callback: (connected: boolean) => void): () => void {
  const sock = getSocket()

  const onConnect = () => callback(true)
  const onDisconnect = () => callback(false)

  sock.on('connect', onConnect)
  sock.on('disconnect', onDisconnect)

  // Gọi callback ngay với trạng thái hiện tại
  callback(sock.connected)

  return () => {
    sock.off('connect', onConnect)
    sock.off('disconnect', onDisconnect)
  }
}
