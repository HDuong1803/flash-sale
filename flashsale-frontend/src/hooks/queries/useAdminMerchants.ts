import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin.service'
import type { Merchant, KycStatus } from '@/types'

export function useAdminMerchants(status?: KycStatus, enabled = true) {
  const [data, setData] = useState<Merchant[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const result = await adminService.getMerchants(status)
      setData(result)
    } catch (err) {
      setData([])
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [status, enabled])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
