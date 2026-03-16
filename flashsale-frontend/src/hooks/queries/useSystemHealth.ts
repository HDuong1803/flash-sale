import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin.service'
import type { SystemHealth } from '@/types'

export function useSystemHealth() {
  const [data, setData] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await adminService.getSystemHealth()
      setData(result)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
