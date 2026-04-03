import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { campaignService } from '@/services/campaign.service'

export function useSubmitCampaign() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const mutate = async (id: string) => {
    setLoading(true)
    try {
      const result = await campaignService.submit(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
      ])
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
