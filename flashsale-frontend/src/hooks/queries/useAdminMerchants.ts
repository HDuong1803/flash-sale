import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { KycStatus } from '@/types'

export function useAdminMerchants(status?: KycStatus, enabled = true) {
  const params = status ? { status } : undefined
  const query = useQuery({
    queryKey: queryKeys.admin.merchants(params),
    queryFn: () => adminService.getMerchants(status),
    enabled,
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải dữ liệu') : null,
    refetch: () => { void query.refetch() },
  }
}
