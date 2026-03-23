import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { orderService } from '@/services/order.service'
import type { Order } from '@/types'

export function useOrder(id: string | null) {
  const query = useQuery<Order | null>({
    queryKey: queryKeys.orders.detail(id ?? ''),
    queryFn: () => orderService.getById(id!),
    enabled: !!id,
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
