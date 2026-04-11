import { useCallback, useEffect, useState } from 'react'
import { orderService } from '@/services/order.service'
import { ApiError } from '@/lib/api-client'
import type { ActiveReservation } from '@/services/order.service'

export function useActiveReservations() {
  const [data, setData] = useState<ActiveReservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await orderService.getActiveReservations()
      setData(result)
    } catch (err) {
      setData([])
      setError(err instanceof ApiError ? err.message : 'Không thể tải giữ chỗ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}
