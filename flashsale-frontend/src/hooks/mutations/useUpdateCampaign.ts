import { useState } from 'react'
import { toast } from 'sonner'
import { campaignService } from '@/services/campaign.service'
import { ApiError } from '@/lib/api-client'
import type { Campaign } from '@/types'

export function useUpdateCampaign() {
  const [loading, setLoading] = useState(false)

  const mutate = async (id: string, data: { name: string; description: string; startTime: string; endTime: string }): Promise<Campaign> => {
    setLoading(true)
    try {
      const result = await campaignService.update(id, data)
      toast.success('Cập nhật chiến dịch thành công!')
      return result
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Cập nhật chiến dịch thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { mutate, loading }
}
