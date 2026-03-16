import { useState } from 'react'
import { toast } from 'sonner'
import { campaignService } from '@/services/campaign.service'

export function usePreRegister() {
  const [loading, setLoading] = useState(false)

  const preRegister = async (campaignId: string) => {
    setLoading(true)
    try {
      const result = await campaignService.preRegister(campaignId)
      toast.success('Đăng ký thành công!')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { preRegister, loading }
}
