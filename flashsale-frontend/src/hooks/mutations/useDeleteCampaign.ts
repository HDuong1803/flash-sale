import { useState } from 'react'
import { toast } from 'sonner'
import { campaignService } from '@/services/campaign.service'

export function useDeleteCampaign() {
  const [loading, setLoading] = useState(false)

  const mutate = async (id: string) => {
    setLoading(true)
    try {
      const result = await campaignService.delete(id)
      toast.success('Đã xóa chiến dịch')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xóa chiến dịch thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { mutate, loading }
}
