import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/contexts/auth-context'
import { merchantService } from '@/services/merchant.service'
import type { MerchantProfile } from '@/types'

/**
 * Trả về merchant profile của user đang đăng nhập.
 * Chỉ fetch khi role === MERCHANT. Kết quả được cache 10 phút.
 */
export function useMerchantProfile(): MerchantProfile | null {
  const { user } = useAuthContext()

  const query = useQuery<MerchantProfile>({
    queryKey: ['merchants', 'profile'],
    queryFn: () => merchantService.getProfile(),
    enabled: user?.role === 'MERCHANT',
    staleTime: 1000 * 60 * 10,
    retry: false,
  })

  return query.data ?? null
}
