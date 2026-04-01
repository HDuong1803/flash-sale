import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { FinanceDashboardSummary } from '@/types'

export function useFinanceSummary() {
  const query = useQuery<FinanceDashboardSummary>({
    queryKey: queryKeys.admin.financeSummary(),
    queryFn: () => adminService.getFinanceSummary(),
  })

  return {
    data: query.data,
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải dữ liệu tài chính') : null,
    refetch: () => { void query.refetch() },
  }
}

