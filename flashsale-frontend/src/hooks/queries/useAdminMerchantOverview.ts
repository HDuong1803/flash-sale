import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'

export function useAdminMerchantOverview(
  merchantId: string,
  days = 30,
  enabled = true
) {
  const query = useQuery({
    queryKey: queryKeys.admin.merchantOverview(merchantId, days),
    queryFn: () => adminService.getMerchantOverview(merchantId, days),
    enabled: enabled && !!merchantId
  })

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải thống kê merchant'
      : null,
    refetch: () => {
      void query.refetch()
    }
  }
}
