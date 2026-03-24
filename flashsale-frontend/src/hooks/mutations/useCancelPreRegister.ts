import { useState } from 'react'
import { toast } from 'sonner'
import { campaignService } from '@/services/campaign.service'

export function useCancelPreRegister() {
  const [loading, setLoading] = useState(false)

  const cancelPreRegister = async (campaignId: string) => {
    setLoading(true)
    try {
      const result = await campaignService.cancelPreRegister(campaignId)
      toast.success('Đã huỷ đăng ký nhắc nhở')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { cancelPreRegister, loading }
}
