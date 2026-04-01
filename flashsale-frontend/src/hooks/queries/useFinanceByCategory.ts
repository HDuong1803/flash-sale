import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { CommissionCategoryBreakdown } from '@/types'

export function useFinanceByCategory() {
  const query = useQuery<CommissionCategoryBreakdown[]>({
    queryKey: queryKeys.admin.financeByCategory(),
    queryFn: () => adminService.getFinanceByCategory(),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải breakdown danh mục') : null,
    refetch: () => { void query.refetch() },
  }
}

