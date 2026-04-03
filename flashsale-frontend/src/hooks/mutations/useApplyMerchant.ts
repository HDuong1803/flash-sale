import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { merchantService, type ApplyMerchantDto } from '@/services/merchant.service'

export function useApplyMerchant() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const mutate = async (data: ApplyMerchantDto) => {
    setLoading(true)
    try {
      const result = await merchantService.apply(data)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.merchants.all }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'merchants'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'merchant-profiles'] }),
      ])
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
