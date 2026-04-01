import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'

export function useUserActionLogs(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.admin.userActionLogs(),
    queryFn: () => adminService.getUserActionLogs(),
    enabled,
    refetchInterval: 30_000,
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải nhật ký thao tác') : null,
    refetch: () => { void query.refetch() },
  }
}
