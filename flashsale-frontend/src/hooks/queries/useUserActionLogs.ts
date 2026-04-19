import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'

export function useUserActionLogs(params?: { from?: string; to?: string }, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.admin.userActionLogs(params),
    queryFn: () => adminService.getUserActionLogs(params),
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
