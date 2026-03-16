import { useState, useEffect, useCallback } from 'react'
import { merchantService } from '@/services/merchant.service'
import type { MerchantApplication } from '@/types'

export function useApplicationStatus() {
  const [data, setData] = useState<MerchantApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await merchantService.getApplicationStatus()
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
