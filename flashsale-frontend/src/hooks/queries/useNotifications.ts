import { useState, useEffect, useCallback } from 'react'
import { notificationService } from '@/services/notification.service'
import { ApiError } from '@/lib/api-client'
import type { Notification } from '@/types'

export function useNotifications() {
  const [data, setData] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await notificationService.getAll()
      setData(result)
    } catch (err) {
      setData([])
      setError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    const interval = setInterval(fetch, 60_000)
    return () => clearInterval(interval)
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}
