import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { orderService, type OrderFilters } from '@/services/order.service'
import type { Order } from '@/types'

export function useMerchantOrders(filters?: OrderFilters) {
  const query = useQuery<Order[]>({
    queryKey: queryKeys.orders.merchant(filters),
    queryFn: () => orderService.getMerchantOrders(filters),
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
