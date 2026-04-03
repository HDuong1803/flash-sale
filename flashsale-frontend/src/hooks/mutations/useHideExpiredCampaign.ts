import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { campaignService } from '@/services/campaign.service'

export function useHideExpiredCampaign() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const hideExpired = async (id: string) => {
    setLoading(true)
    try {
      const result = await campaignService.hideExpired(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
      ])
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
