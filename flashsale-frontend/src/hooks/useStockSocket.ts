/**
 * useStockSocket — Hook nhận cập nhật tồn kho và giá real-time qua WebSocket.
 *
 * Cách dùng:
 * ```tsx
 * const { stockMap, priceMap, isConnected, lastUpdateAt } = useStockSocket(campaignId, products)
 * ```
 *
 * stockMap: Record<campaignProductId, stockRemaining> — override tồn kho từ server realtime
 * priceMap: Record<campaignProductId, newPrice> — override giá từ pricing engine realtime
 *
 * Flow:
 * 1. Hook mount → subscribe vào WebSocket room của campaignId
 * 2. Server push 'stock:update' → cập nhật stockMap
 * 3. Server push 'price:update' → cập nhật priceMap
 * 4. Hook unmount → unsubscribe, remove listeners
 *
 * Edge cases:
 * - campaignId = undefined → hook không làm gì (campaign chưa load)
 * - WebSocket disconnect → isConnected=false, stockMap giữ giá trị cuối
 * - Reconnect → tự động rejoin room (ws-client.ts xử lý)
 */

'use client'

import { useEffect, useState } from 'react'
import {
  subscribeToCamera,
  onConnectionChange,
  isSocketConnected,
  type StockUpdatePayload,
  type PriceUpdatePayload
} from '@/lib/ws-client'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Map từ campaignProductId → số tồn kho real-time */
export type StockMap = Record<string, number>

/** Map từ campaignProductId → giá bán real-time */
export type PriceMap = Record<string, number>

export interface UseStockSocketResult {
  /** Tồn kho real-time theo product. undefined = chưa có update từ WebSocket */
  stockMap: StockMap
  /** Giá real-time theo product. undefined = chưa có update từ WebSocket */
  priceMap: PriceMap
  /** Trạng thái kết nối WebSocket */
  isConnected: boolean
  /** Thời điểm nhận update cuối cùng (null = chưa nhận bao giờ) */
  lastUpdateAt: Date | null
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param campaignId - ID campaign để join room WebSocket (undefined = skip)
 */
export function useStockSocket(campaignId: string | undefined): UseStockSocketResult {
  const [stockMap, setStockMap] = useState<StockMap>({})
  const [priceMap, setPriceMap] = useState<PriceMap>({})
  const [isConnected, setIsConnected] = useState<boolean>(isSocketConnected)
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!campaignId) {
      return
    }

    // Handler nhận stock update từ server
    const handleStockUpdate = (payload: StockUpdatePayload) => {
      setStockMap(prev => ({
        ...prev,
        [payload.campaignProductId]: payload.stockRemaining
      }))
      setLastUpdateAt(new Date())
    }

    // Handler nhận price update từ pricing engine
    const handlePriceUpdate = (payload: PriceUpdatePayload) => {
      setPriceMap(prev => ({
        ...prev,
        [payload.campaignProductId]: payload.newPrice
      }))
      setLastUpdateAt(new Date())
    }

    // Subscribe vào room của campaign này
    const unsubscribe = subscribeToCamera(campaignId, handleStockUpdate, handlePriceUpdate)

    // Theo dõi thay đổi trạng thái kết nối để update indicator
    const unsubscribeConnection = onConnectionChange(setIsConnected)

    // Cleanup khi component unmount hoặc campaignId thay đổi
    return () => {
      unsubscribe()
      unsubscribeConnection()
    }
  }, [campaignId])

  return { stockMap, priceMap, isConnected, lastUpdateAt }
}
