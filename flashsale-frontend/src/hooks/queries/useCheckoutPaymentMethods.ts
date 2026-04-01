import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { checkoutService } from '@/services/checkout.service'
import type { CheckoutPaymentMethod } from '@/types'

export function useCheckoutPaymentMethods() {
  const query = useQuery<CheckoutPaymentMethod[]>({
    queryKey: queryKeys.checkout.paymentMethods(),
    queryFn: () => checkoutService.getPaymentMethods(),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải phương thức thanh toán'
      : null,
    refetch: () => { void query.refetch() },
  }
}

