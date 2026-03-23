import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { DeadLetterJob } from '@/types'

export function useDeadLetterJobs() {
  const query = useQuery<DeadLetterJob[]>({
    queryKey: queryKeys.admin.deadLetterQueue(),
    queryFn: () => adminService.getDeadLetterJobs(),
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
