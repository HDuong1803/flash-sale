import { useState } from 'react'
import { toast } from 'sonner'
import { campaignService } from '@/services/campaign.service'

export function useSubmitCampaign() {
  const [loading, setLoading] = useState(false)

  const mutate = async (id: string) => {
    setLoading(true)
    try {
      const result = await campaignService.submit(id)
      toast.success('Gửi duyệt thành công!')
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
