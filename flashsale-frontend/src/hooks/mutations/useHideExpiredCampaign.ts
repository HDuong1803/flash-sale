import { useState } from 'react'
import { toast } from 'sonner'
import { campaignService } from '@/services/campaign.service'

export function useHideExpiredCampaign() {
  const [loading, setLoading] = useState(false)

  const hideExpired = async (id: string) => {
    setLoading(true)
    try {
      const result = await campaignService.hideExpired(id)
      toast.success('Đã ẩn chiến dịch khỏi danh sách hết hạn')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ẩn chiến dịch thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { hideExpired, loading }
}
