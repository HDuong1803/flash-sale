import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { merchantService } from '@/services/merchant.service'
import { useAuthContext } from '@/contexts/auth-context'
import type { MerchantApplication } from '@/types'

export function useApplicationStatus() {
  const { isAuthenticated, setMerchantApplicationStatus } = useAuthContext()

  const query = useQuery<MerchantApplication | null>({
    queryKey: queryKeys.merchants.applicationStatus(),
    queryFn: async () => {
      const result = await merchantService.getApplicationStatus()
      // Sync KYC status into auth context so sidebar banner & hasPermission stay accurate
      if (result?.status) {
        setMerchantApplicationStatus(result.status)
      }
      return result
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  })

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải dữ liệu'
      : null,
    refetch: () => { void query.refetch() },
  }
}
