import { useState } from 'react'
import { toast } from 'sonner'
import { campaignService, type AddCampaignProductDto } from '@/services/campaign.service'

export function useAddCampaignProduct() {
  const [loading, setLoading] = useState(false)

  const mutate = async (campaignId: string, data: AddCampaignProductDto) => {
    setLoading(true)
    try {
      const result = await campaignService.addProduct(campaignId, data)
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
