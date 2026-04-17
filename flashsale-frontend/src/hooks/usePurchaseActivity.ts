'use client'

/**
 * usePurchaseActivity — Theo dõi lịch sử giao dịch real-time qua WebSocket.
 *
 * Cơ chế hoạt động:
 * 1. Subscribe vào WebSocket room của campaign
 * 2. Lọc sự kiện `stock:update` có `source === 'PURCHASE'` (ai đó vừa mua)
 * 3. Thêm vào queue (tối đa `maxItems` gần nhất)
 * 4. Mỗi item tự xóa sau `ttlMs` milliseconds để list không tràn
 *
 * Tại sao dùng riêng thay vì gộp vào useStockSocket?
 * - useStockSocket quản lý state tồn kho → single responsibility
 * - usePurchaseActivity quản lý UX social-proof → tách biệt logic
 * - Caller tự quyết định có dùng activity feed không (optional)
 *
 * Cách dùng:
 * ```tsx
 * const activities = usePurchaseActivity(campaignId)
 * // activities[0] = giao dịch gần nhất
 * ```
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { subscribeToCamera, type StockUpdatePayload } from '@/lib/ws-client'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PurchaseActivity {
  /** ID duy nhất để dùng làm React key */
  id: string
  /** ID sản phẩm trong chiến dịch */
  campaignProductId: string
  /** Tồn kho còn lại sau khi mua */
  stockRemaining: number
  /** Thời điểm nhận được sự kiện */
  purchasedAt: Date
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param campaignId - ID campaign để subscribe (undefined = không làm gì)
 * @param maxItems   - Giữ tối đa N giao dịch gần nhất (default: 4)
 * @param ttlMs      - Thời gian tự xóa mỗi item (default: 8 giây)
 */
export function usePurchaseActivity(
  campaignId: string | undefined,
  maxItems = 4,
  ttlMs = 8_000
): PurchaseActivity[] {
  const [activities, setActivities] = useState<PurchaseActivity[]>([])

  /**
   * Dùng ref để track timers cleanup — tránh memory leak khi unmount
   * trong khi timer vẫn đang chạy
   */
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  /**
   * Xóa một activity khỏi list sau TTL.
   * Dùng id để target chính xác item cần xóa (tránh xóa nhầm).
   */
  const scheduleRemoval = useCallback((id: string) => {
    const timer = setTimeout(() => {
      setActivities(prev => prev.filter(a => a.id !== id))
    }, ttlMs)
    timersRef.current.push(timer)
  }, [ttlMs])

  useEffect(() => {
    if (!campaignId) return

    /**
     * Handler nhận stock:update — chỉ xử lý khi source là PURCHASE
     * (bỏ qua PRICE_UPDATE và MANUAL để tránh nhiễu feed)
     */
    const handleStockUpdate = (payload: StockUpdatePayload) => {
      if (payload.source !== 'PURCHASE') return

      const newActivity: PurchaseActivity = {
        // Kết hợp campaignProductId + timestamp để ID luôn unique
        id: `${payload.campaignProductId}-${Date.now()}-${Math.random()}`,
        campaignProductId: payload.campaignProductId,
        stockRemaining: payload.stockRemaining,
        purchasedAt: new Date()
      }

      // Thêm vào đầu list, cắt bỏ phần thừa quá maxItems
      setActivities(prev => [newActivity, ...prev].slice(0, maxItems))

      // Lên lịch tự xóa sau TTL
      scheduleRemoval(newActivity.id)
    }

    // Subscribe vào room — subscribeToCamera trả về hàm cleanup
    const unsubscribe = subscribeToCamera(campaignId, handleStockUpdate)

    return () => {
      unsubscribe()
      // Clear tất cả timer đang chờ khi unmount
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [campaignId, maxItems, scheduleRemoval])

  return activities
}
