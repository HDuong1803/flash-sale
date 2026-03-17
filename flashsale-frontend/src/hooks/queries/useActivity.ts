import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/lib/api-client'
import type { ActivityLog } from '@/types'

export function useActivity() {
  const [data, setData] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await adminService.getActivity()) }
    catch (err) { setData([]); setError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
