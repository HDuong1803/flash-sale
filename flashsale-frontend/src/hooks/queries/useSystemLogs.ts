import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { SystemLog } from '@/types'

export function useSystemLogs() {
  const query = useQuery<SystemLog[]>({
    queryKey: queryKeys.admin.logs(),
    queryFn: () => adminService.getSystemLogs(),
    refetchInterval: 30_000,
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
