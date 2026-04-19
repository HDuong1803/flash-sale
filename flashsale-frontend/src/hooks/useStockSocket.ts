'use client'

import { useEffect, useState } from 'react'
import {
  subscribeToCamera,
  onConnectionChange,
  isSocketConnected,
  type StockUpdatePayload
} from '@/lib/ws-client'

/** Map từ campaignProductId → số tồn kho real-time */
export type StockMap = Record<string, number>

export interface UseStockSocketResult {
  /** Tồn kho real-time theo product. undefined = chưa có update từ WebSocket */
  stockMap: StockMap
  /** Trạng thái kết nối WebSocket */
  isConnected: boolean
  /** Thời điểm nhận update cuối cùng (null = chưa nhận bao giờ) */
  lastUpdateAt: Date | null
}

/**
 * @param campaignId - ID campaign để join room WebSocket (undefined = skip)
 */
export function useStockSocket(campaignId: string | undefined): UseStockSocketResult {
  const [stockMap, setStockMap] = useState<StockMap>({})
  const [isConnected, setIsConnected] = useState<boolean>(isSocketConnected)
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!campaignId) {
      return
    }

    const handleStockUpdate = (payload: StockUpdatePayload) => {
      setStockMap(prev => ({
        ...prev,
        [payload.campaignProductId]: payload.stockRemaining
      }))
      setLastUpdateAt(new Date())
    }

    const unsubscribe = subscribeToCamera(campaignId, handleStockUpdate)
    const unsubscribeConnection = onConnectionChange(setIsConnected)

    return () => {
      unsubscribe()
      unsubscribeConnection()
    }
  }, [campaignId])

  return { stockMap, isConnected, lastUpdateAt }
}
