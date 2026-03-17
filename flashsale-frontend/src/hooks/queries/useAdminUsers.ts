import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin.service'
import type { User, UserRole } from '@/types'

export function useAdminUsers(filters?: { role?: UserRole; search?: string; page?: number; limit?: number }) {
  const [data, setData] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await adminService.getUsers(filters)
      setData(result)
    } catch (err) {
      setData([])
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
