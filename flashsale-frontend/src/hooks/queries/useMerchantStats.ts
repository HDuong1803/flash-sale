import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { merchantService } from '@/services/merchant.service'
import type { MerchantStats } from '@/types'

export function useMerchantStats() {
  const query = useQuery<MerchantStats | null>({
    queryKey: queryKeys.merchants.stats(),
    queryFn: () => merchantService.getStats(),
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
