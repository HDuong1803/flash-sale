import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { campaignService, type AddCampaignProductDto } from '@/services/campaign.service'
import { queryKeys } from '@/lib/query-keys'

export function useAddCampaignProduct() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const mutate = async (campaignId: string, data: AddCampaignProductDto) => {
    setLoading(true)
    try {
      const result = await campaignService.addProduct(campaignId, data)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
      ])
      toast.success('Thêm sản phẩm thành công!')
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
