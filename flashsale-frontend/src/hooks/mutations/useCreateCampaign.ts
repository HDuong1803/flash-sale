import { useState } from 'react'
import { toast } from 'sonner'
import { campaignService, type CreateCampaignDto } from '@/services/campaign.service'

export function useCreateCampaign() {
  const [loading, setLoading] = useState(false)

  const mutate = async (data: CreateCampaignDto) => {
    setLoading(true)
    try {
      const result = await campaignService.create(data)
      toast.success('Tạo chiến dịch thành công!')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { mutate, loading }
}
