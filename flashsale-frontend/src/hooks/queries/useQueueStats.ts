import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { QueueStats } from '@/types'

export function useQueueStats() {
  const query = useQuery<QueueStats | null>({
    queryKey: queryKeys.admin.queueStats(),
    queryFn: () => adminService.getQueueStats(),
    refetchInterval: 60_000, // fallback khi SSE mất — SSE push mỗi 10s là primary
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
