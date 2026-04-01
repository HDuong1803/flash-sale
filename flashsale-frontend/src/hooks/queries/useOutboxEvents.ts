import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'

export function useOutboxEvents(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.admin.outboxEvents(),
    queryFn: () => adminService.getOutboxEvents(),
    enabled,
    refetchInterval: 30_000,
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải Sự kiện chờ gửi') : null,
    refetch: () => { void query.refetch() },
  }
}
