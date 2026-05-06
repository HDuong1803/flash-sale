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
  revenue?: number | string
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
  revenue?: number | string
}

interface DashboardHeartbeatEvent {
  type: 'heartbeat'
}

type DashboardStreamEvent =
  | DashboardSnapshotEvent
  | DashboardStockUpdateEvent
  | DashboardOrderConfirmedEvent
  | DashboardHeartbeatEvent

interface CampaignMetricsState {
  campaignId: string
  metrics: DashboardMetrics
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function useSSE(campaignId: string | null) {
  const [dataState, setDataState] = useState<CampaignMetricsState | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const retriesRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const activeConnectionTokenRef = useRef<symbol | null>(null)
  const mountedRef = useRef(true)
  const orderTimestampsByCampaignRef = useRef<Record<string, number[]>>({})

  useEffect(() => {
    if (!campaignId) return
    mountedRef.current = true
    retriesRef.current = 0
    setConnected(false)
    setError(null)

    const connectionToken = Symbol(`sse-${campaignId}`)
    activeConnectionTokenRef.current = connectionToken

    const getOrdersPerSecond = (targetCampaignId: string): number => {
      const now = Date.now()
      const timestamps =
        orderTimestampsByCampaignRef.current[targetCampaignId] ?? []
      const filtered = timestamps.filter(
        (ts) => now - ts <= ORDERS_PER_SECOND_WINDOW_MS
      )
      orderTimestampsByCampaignRef.current[targetCampaignId] = filtered
      return filtered.length / (ORDERS_PER_SECOND_WINDOW_MS / 1000)
    }

    const ticker = setInterval(() => {
      if (!mountedRef.current) return
      setDataState((prev) => {
        if (!prev || prev.campaignId !== campaignId) return prev
        return {
          campaignId,
          metrics: {
            ...prev.metrics,
            ordersPerSecond: getOrdersPerSecond(campaignId)
          }
        }
      })
    }, 1000)

    const connect = () => {
      if (!mountedRef.current) return
      const es = dashboardService.connect(campaignId)
      esRef.current = es

      es.onopen = () => {
        if (
          !mountedRef.current ||
          activeConnectionTokenRef.current !== connectionToken ||
          esRef.current !== es
        ) {
          return
        }
        setConnected(true)
        setError(null)
        retriesRef.current = 0
      }

      es.onmessage = (e) => {
        if (
          !mountedRef.current ||
          activeConnectionTokenRef.current !== connectionToken ||
          esRef.current !== es
        ) {
          return
        }
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
            const revenue = toNumber(event.revenue)
            const conversionRate =
              event.conversionRate ??
              (totalReservations > 0
                ? (successOrders / totalReservations) * 100
                : 0)

            setDataState({
              campaignId,
              metrics: {
                stockRemaining,
                stockTotal,
                totalOrders,
                successOrders,
                totalReservations,
                revenue,
                conversionRate,
                queueDepth: event.queueDepth ?? 0,
                ordersPerSecond: getOrdersPerSecond(campaignId)
              }
            })
            return
          }

          if (event.type === 'STOCK_UPDATE') {
            setDataState(prev => {
              if (!prev || prev.campaignId !== campaignId) return prev
              return {
                campaignId,
                metrics: {
                  ...prev.metrics,
                  stockRemaining:
                    event.stockRemaining ?? prev.metrics.stockRemaining,
                  stockTotal: event.stockTotal ?? prev.metrics.stockTotal
                }
              }
            })
            return
          }

          if (event.type === 'ORDER_CONFIRMED') {
            const now = Date.now()
            const currentTimestamps =
              orderTimestampsByCampaignRef.current[campaignId] ?? []
            orderTimestampsByCampaignRef.current[campaignId] = [
              ...currentTimestamps,
              now
            ]
            const currentOps = getOrdersPerSecond(campaignId)

            setDataState(prev => {
              if (!prev || prev.campaignId !== campaignId) return prev
              const nextTotalOrders = prev.metrics.totalOrders + 1
              const nextSuccessOrders = prev.metrics.successOrders + 1
              const nextQueueDepth = Math.max(prev.metrics.queueDepth - 1, 0)
              const revenueDelta = toNumber(event.revenue)
              return {
                campaignId,
                metrics: {
                  ...prev.metrics,
                  totalOrders: nextTotalOrders,
                  successOrders: nextSuccessOrders,
                  revenue: toNumber(prev.metrics.revenue) + revenueDelta,
                  conversionRate:
                    prev.metrics.totalReservations > 0
                      ?
                          (nextSuccessOrders /
                            prev.metrics.totalReservations) *
                          100
                      : 0,
                  queueDepth: nextQueueDepth,
                  ordersPerSecond: currentOps
                }
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
        if (
          !mountedRef.current ||
          activeConnectionTokenRef.current !== connectionToken ||
          esRef.current !== es
        ) {
          return
        }
        setConnected(false)
        es.close()
        if (esRef.current === es) {
          esRef.current = null
        }
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
      if (activeConnectionTokenRef.current === connectionToken) {
        activeConnectionTokenRef.current = null
      }
      delete orderTimestampsByCampaignRef.current[campaignId]
    }
  }, [campaignId])

  const data =
    campaignId && dataState?.campaignId === campaignId
      ? dataState.metrics
      : null

  return { data, connected, error }
}
