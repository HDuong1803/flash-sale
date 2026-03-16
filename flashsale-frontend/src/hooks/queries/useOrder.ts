import { useState, useEffect, useCallback } from 'react'
import { orderService } from '@/services/order.service'
import type { Order } from '@/types'

export function useOrder(id: string | null) {
  const [data, setData] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    try { setData(await orderService.getById(id)) }
    catch (err) { setData(null); setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
