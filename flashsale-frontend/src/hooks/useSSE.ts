import { useEffect, useRef, useState } from 'react'
import { dashboardService } from '@/services/dashboard.service'
import type { DashboardMetrics } from '@/types'

export function useSSE(campaignId: string | null) {
  const [data, setData] = useState<DashboardMetrics | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const retriesRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)

  useEffect(() => {
    if (!campaignId) return
    mountedRef.current = true

    const connect = () => {
      if (!mountedRef.current) return
      const es = dashboardService.connect(campaignId)
      esRef.current = es

      es.onopen = () => {
        if (!mountedRef.current) return
        setConnected(true)
        setError(null)
        retriesRef.current = 0
      }

      es.onmessage = (e) => {
        if (!mountedRef.current) return
        try {
          const event = JSON.parse(e.data) as Record<string, unknown>
          if (event.type === 'heartbeat') return

          if (event.type === 'SNAPSHOT') {
            const stockValues = (event.stockValues as Array<{ remaining: number; total: number }>) ?? []
            const stockRemaining = stockValues.reduce((sum, v) => sum + v.remaining, 0)
            const stockTotal = stockValues.reduce((sum, v) => sum + v.total, 0)
            setData({
              stockRemaining,
              stockTotal,
              totalOrders: (event.totalOrders as number) ?? 0,
              successOrders: 0,
              revenue: 0,
              conversionRate: 0,
              queueDepth: 0,
              ordersPerSecond: 0,
            })
            return
          }

          if (event.type === 'STOCK_UPDATE') {
            setData(prev => prev ? {
              ...prev,
              stockRemaining: (event.stockRemaining as number) ?? prev.stockRemaining,
              stockTotal: (event.stockTotal as number) ?? prev.stockTotal,
            } : prev)
            return
          }

          if (event.type === 'ORDER_CONFIRMED') {
            setData(prev => prev ? {
              ...prev,
              totalOrders: prev.totalOrders + 1,
              successOrders: prev.successOrders + 1,
              revenue: prev.revenue + ((event.revenue as number) ?? 0),
            } : prev)
            return
          }
        } catch { /* ignore parse errors */ }
      }

      es.onerror = () => {
        if (!mountedRef.current) return
        setConnected(false)
        es.close()
        if (retriesRef.current < 3) {
          retriesRef.current++
          setError(`Đang kết nối lại... (${retriesRef.current}/3)`)
          retryTimerRef.current = setTimeout(connect, 2000)
        } else {
          setError('Không thể kết nối realtime. Tải lại trang để thử lại.')
        }
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      clearTimeout(retryTimerRef.current)
      esRef.current?.close()
      esRef.current = null
    }
  }, [campaignId])

  return { data, connected, error }
}
