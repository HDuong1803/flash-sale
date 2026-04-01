import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { FinanceTrendItem } from '@/types'

export function useFinanceTrend() {
  const query = useQuery<FinanceTrendItem[]>({
    queryKey: queryKeys.admin.financeTrend(),
    queryFn: () => adminService.getFinanceTrend(),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải xu hướng tài chính') : null,
    refetch: () => { void query.refetch() },
  }
}

