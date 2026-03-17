import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/lib/api-client'
import type { RevenueTrend } from '@/types'

export function useRevenueTrend() {
  const [data, setData] = useState<RevenueTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await adminService.getRevenueTrend()) }
    catch (err) { setData([]); setError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
