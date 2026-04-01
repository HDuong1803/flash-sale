import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'
import type { KycStatus } from '@/types'

export function useAdminMerchantProfiles(status?: KycStatus, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.admin.merchantProfiles({ status }),
    queryFn: () => adminService.getMerchantProfiles(status),
    enabled,
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải hồ sơ nhà bán hàng') : null,
    refetch: () => { void query.refetch() },
  }
}
