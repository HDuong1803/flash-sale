import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { AdminStats } from '@/types'

export function useAdminStats() {
  const query = useQuery<AdminStats | null>({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => adminService.getStats(),
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
