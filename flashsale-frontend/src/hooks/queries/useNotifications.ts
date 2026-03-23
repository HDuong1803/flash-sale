import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { notificationService } from '@/services/notification.service'

export function useNotifications() {
  const query = useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: () => notificationService.getAll(),
    refetchInterval: 60_000,
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải dữ liệu') : null,
    refetch: () => { void query.refetch() },
  }
}
