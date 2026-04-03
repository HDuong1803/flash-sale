import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { campaignService } from '@/services/campaign.service'
import { queryKeys } from '@/lib/query-keys'

export function useCancelPreRegister() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const cancelPreRegister = async (campaignId: string) => {
    setLoading(true)
    try {
      const result = await campaignService.cancelPreRegister(campaignId)
      await queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
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
