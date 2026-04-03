import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { campaignService } from '@/services/campaign.service'

export function useDeleteCampaign() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const mutate = async (id: string) => {
    setLoading(true)
    try {
      const result = await campaignService.delete(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
      ])
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
