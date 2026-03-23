import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { RevenueTrend } from '@/types'

export function useRevenueTrend() {
  const query = useQuery<RevenueTrend[]>({
    queryKey: queryKeys.admin.revenueTrend(),
    queryFn: () => adminService.getRevenueTrend(),
  })

  return {
    data: query.data ?? [],
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
