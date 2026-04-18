import { useEffect, useRef, useState } from 'react'
import { dashboardService } from '@/services/dashboard.service'
import type { DashboardMetrics } from '@/types'

const ORDERS_PER_SECOND_WINDOW_MS = 10_000

interface DashboardSnapshotEvent {
  type: 'SNAPSHOT'
  stockValues?: Array<{ remaining: number; total: number }>
  totalOrders?: number
  successOrders?: number
  totalReservations?: number
  revenue?: number
  conversionRate?: number
  queueDepth?: number
}

interface DashboardStockUpdateEvent {
  type: 'STOCK_UPDATE'
  stockRemaining?: number
  stockTotal?: number
}

interface DashboardOrderConfirmedEvent {
  type: 'ORDER_CONFIRMED'
  revenue?: number
}

interface DashboardHeartbeatEvent {
  type: 'heartbeat'
}

type DashboardStreamEvent =
  | DashboardSnapshotEvent
  | DashboardStockUpdateEvent
  | DashboardOrderConfirmedEvent
  | DashboardHeartbeatEvent

export function useSSE(campaignId: string | null) {
  const [data, setData] = useState<DashboardMetrics | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const retriesRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)
  const orderTimestampsRef = useRef<number[]>([])

  useEffect(() => {
    if (!campaignId) return
    mountedRef.current = true

    const getOrdersPerSecond = (): number => {
      const now = Date.now()
      orderTimestampsRef.current = orderTimestampsRef.current.filter(
        (ts) => now - ts <= ORDERS_PER_SECOND_WINDOW_MS
      )
      return orderTimestampsRef.current.length / (ORDERS_PER_SECOND_WINDOW_MS / 1000)
    }

    const ticker = setInterval(() => {
      if (!mountedRef.current) return
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          ordersPerSecond: getOrdersPerSecond()
        }
      })
    }, 1000)

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
          const event = JSON.parse(e.data) as DashboardStreamEvent
          if (event.type === 'heartbeat') return

          if (event.type === 'SNAPSHOT') {
            const stockValues = event.stockValues ?? []
            const stockRemaining = stockValues.reduce((sum, v) => sum + v.remaining, 0)
            const stockTotal = stockValues.reduce((sum, v) => sum + v.total, 0)
            const totalOrders = event.totalOrders ?? 0
            const successOrders = event.successOrders ?? 0
            const totalReservations = event.totalReservations ?? totalOrders
            const conversionRate =
              event.conversionRate ??
              (totalReservations > 0
                ? (successOrders / totalReservations) * 100
                : 0)

            setData({
              stockRemaining,
              stockTotal,
              totalOrders,
              successOrders,
              totalReservations,
              revenue: event.revenue ?? 0,
              conversionRate,
              queueDepth: event.queueDepth ?? 0,
              ordersPerSecond: getOrdersPerSecond(),
            })
            return
          }

          if (event.type === 'STOCK_UPDATE') {
            setData(prev => prev ? {
              ...prev,
              stockRemaining: event.stockRemaining ?? prev.stockRemaining,
              stockTotal: event.stockTotal ?? prev.stockTotal,
            } : prev)
            return
          }

          if (event.type === 'ORDER_CONFIRMED') {
            const now = Date.now()
            orderTimestampsRef.current = [...orderTimestampsRef.current, now]
            const currentOps = getOrdersPerSecond()

            setData(prev => {
              if (!prev) return prev
              const nextTotalOrders = prev.totalOrders + 1
              const nextSuccessOrders = prev.successOrders + 1
              const nextQueueDepth = Math.max(prev.queueDepth - 1, 0)
              return {
                ...prev,
                totalOrders: nextTotalOrders,
                successOrders: nextSuccessOrders,
                revenue: prev.revenue + (event.revenue ?? 0),
                conversionRate:
                  prev.totalReservations > 0
                    ? (nextSuccessOrders / prev.totalReservations) * 100
                    : 0,
                queueDepth: nextQueueDepth,
                ordersPerSecond: currentOps,
              }
            })
            return
          }

          // Ignore unknown event types to keep stream resilient.
        } catch {
          /* ignore parse errors */
        }
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
      clearInterval(ticker)
      clearTimeout(retryTimerRef.current)
      esRef.current?.close()
      esRef.current = null
      orderTimestampsRef.current = []
    }
  }, [campaignId])

  return { data, connected, error }
}
