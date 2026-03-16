import { useState } from 'react'
import { toast } from 'sonner'
import { merchantService, type ApplyMerchantDto } from '@/services/merchant.service'

export function useApplyMerchant() {
  const [loading, setLoading] = useState(false)

  const mutate = async (data: ApplyMerchantDto) => {
    setLoading(true)
    try {
      const result = await merchantService.apply(data)
      toast.success('Đăng ký thành công! Chờ xét duyệt.')
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
