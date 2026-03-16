import { useState, useEffect, useCallback } from 'react'
import { campaignService, type CampaignFilters } from '@/services/campaign.service'
import type { Campaign } from '@/types'

export function useCampaigns(filters?: CampaignFilters) {
  const [data, setData] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await campaignService.getAll(filters)
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
