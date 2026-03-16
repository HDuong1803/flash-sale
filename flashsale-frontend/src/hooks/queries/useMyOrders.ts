import { useState, useEffect, useCallback } from 'react'
import { orderService, type OrderFilters } from '@/services/order.service'
import type { Order } from '@/types'

export function useMyOrders(filters?: OrderFilters) {
  const [data, setData] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await orderService.getMyOrders(filters)
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
