import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { OrdersByHour } from '@/types'

export function useOrdersByTime(start: Date, end: Date) {
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  const query = useQuery<OrdersByHour[]>({
    queryKey: queryKeys.admin.ordersByTime(startIso, endIso),
    queryFn: () => adminService.getOrdersByTime(start, end),
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

/** @deprecated Use useOrdersByTime */
export const useOrdersByHour = useOrdersByTime
