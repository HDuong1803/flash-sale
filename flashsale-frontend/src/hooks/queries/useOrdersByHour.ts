import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/lib/api-client'
import type { OrdersByHour } from '@/types'

export function useOrdersByHour() {
  const [data, setData] = useState<OrdersByHour[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await adminService.getOrdersByHour()) }
    catch (err) { setData([]); setError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
