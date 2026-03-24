import { useState, useCallback, useEffect } from 'react'
import { merchantService } from '@/services/merchant.service'
import { ApiError } from '@/lib/api-client'
import type { MerchantRevenue, RevenueDateRange } from '@/types'

export function useMerchantRevenue(range: RevenueDateRange) {
  const [data, setData] = useState<MerchantRevenue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await merchantService.getRevenue(range))
    } catch (err) {
      setData(null)
      setError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu doanh thu')
    } finally {
      setLoading(false)
    }
  }, [range.startDate, range.endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}
