import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { orderService, type OrderFilters } from '@/services/order.service'

export function useMyOrders(filters?: OrderFilters) {
  const query = useQuery({
    queryKey: queryKeys.orders.list(filters),
    queryFn: () => orderService.getMyOrders(filters),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải dữ liệu') : null,
    refetch: () => { void query.refetch() },
  }
}
