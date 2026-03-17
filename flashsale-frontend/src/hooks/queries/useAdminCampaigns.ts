import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin.service'
import type { Campaign, CampaignStatus } from '@/types'

export function useAdminCampaigns(status?: CampaignStatus) {
  const [data, setData] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await adminService.getCampaigns(status)
      setData(result)
    } catch (err) {
      setData([])
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
