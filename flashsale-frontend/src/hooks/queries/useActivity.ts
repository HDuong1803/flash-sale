import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { ActivityLog } from '@/types'

export function useActivity() {
  const query = useQuery<ActivityLog[]>({
    queryKey: queryKeys.admin.activity(),
    queryFn: () => adminService.getActivity(),
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
