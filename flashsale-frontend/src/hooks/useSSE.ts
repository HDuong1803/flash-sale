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
        try { setData(JSON.parse(e.data) as DashboardMetrics) } catch { /* ignore parse errors */ }
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
