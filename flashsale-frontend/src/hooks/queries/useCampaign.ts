import { useState, useEffect, useCallback } from 'react'
import { campaignService } from '@/services/campaign.service'
import type { Campaign } from '@/types'

export function useCampaign(id: string | null) {
  const [data, setData] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    try { setData(await campaignService.getById(id)) }
    catch (err) { setData(null); setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
