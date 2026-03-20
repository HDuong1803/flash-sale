import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/lib/api-client'
import type { OrdersByHour } from '@/types'

export function useOrdersByTime(start: Date, end: Date) {
  const [data, setData] = useState<OrdersByHour[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await adminService.getOrdersByTime(start, end)) }
    catch (err) { setData([]); setError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu') }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.toISOString(), end.toISOString()])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

/** @deprecated Use useOrdersByTime */
export const useOrdersByHour = useOrdersByTime
