'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { AdminStats, SystemHealth, QueueStats } from '@/types'

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

export type AdminStreamEvent =
  | { type: 'system_health'; data: SystemHealth }
  | { type: 'queue_stats'; data: QueueStats }
  | { type: 'admin_stats'; data: AdminStats }
  | {
      type: 'SLA_WARNING' | 'SLA_BREACH'
      data: {
        type: 'SLA_WARNING' | 'SLA_BREACH'
        fulfillmentId: string
        orderId: string
        fulfillStatus: string
        slaDeadline: string | null
        breachedAt?: string
      }
    }
  | { type: 'heartbeat'; data: { ts: number } }

/**
 * Kết nối SSE tới /admin/stream và cập nhật React Query cache tự động.
 * Các hook useSystemHealth / useQueueStats / useAdminStats sẽ nhận dữ liệu
 * mới ngay khi server push mà không cần refetch HTTP.
 *
 * Auth: dựa vào HttpOnly cookie `access_token` (withCredentials: true).
 * Retry: tối đa 5 lần, delay tăng dần (2s → 10s).
 */
export function useAdminStream(options?: {
  onEvent?: (event: AdminStreamEvent) => void
}) {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const retriesRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    const connect = () => {
      if (!mountedRef.current) return

      const es = new EventSource(`${BASE_URL}/admin/stream`, {
        withCredentials: true
      })
      esRef.current = es

      es.onopen = () => {
        if (!mountedRef.current) return
        setConnected(true)
        retriesRef.current = 0
      }

      es.onmessage = (e: MessageEvent<string>) => {
        if (!mountedRef.current) return
        try {
          const event = JSON.parse(e.data) as AdminStreamEvent
          switch (event.type) {
            case 'system_health':
              queryClient.setQueryData(queryKeys.admin.health(), event.data)
              break
            case 'queue_stats':
              queryClient.setQueryData(queryKeys.admin.queueStats(), event.data)
              break
            case 'admin_stats':
              queryClient.setQueryData(queryKeys.admin.stats(), event.data)
              break
          }

          options?.onEvent?.(event)
        } catch {
          // Bỏ qua lỗi parse — không làm gián đoạn stream
        }
      }

      es.onerror = () => {
        if (!mountedRef.current) return
        setConnected(false)
        es.close()
        if (retriesRef.current < 5) {
          retriesRef.current++
          const delay = Math.min(2_000 * retriesRef.current, 10_000)
          retryTimerRef.current = setTimeout(connect, delay)
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
  }, [options, queryClient])

  return { connected }
}
