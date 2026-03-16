import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin.service'
import type { DeadLetterJob } from '@/types'

export function useDeadLetterJobs() {
  const [data, setData] = useState<DeadLetterJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await adminService.getDeadLetterJobs()
      setData(result)
    } catch (err) {
      setData([])
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
