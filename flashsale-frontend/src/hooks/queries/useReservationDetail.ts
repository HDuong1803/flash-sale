import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { orderService } from '@/services/order.service'
import type { ReservationDetail } from '@/services/order.service'

export function useReservationDetail(reservationId: string | null) {
  const query = useQuery<ReservationDetail | null>({
    queryKey: queryKeys.orders.reservation(reservationId ?? ''),
    queryFn: () => orderService.getReservation(reservationId!),
    enabled: !!reservationId,
  })

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải thông tin giữ chỗ'
      : null,
    refetch: () => { void query.refetch() },
  }
}
