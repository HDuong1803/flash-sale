import { useState, useEffect, useCallback } from 'react'
import { merchantService } from '@/services/merchant.service'
import type { MerchantStats } from '@/types'

export function useMerchantStats() {
  const [data, setData] = useState<MerchantStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await merchantService.getStats()
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
