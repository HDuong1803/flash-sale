import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { merchantService } from '@/services/merchant.service'
import type { StripeConnectStatusResponse } from '@/types'

const DEFAULT_STATUS: StripeConnectStatusResponse = {
  status: 'NOT_CONNECTED',
  chargesEnabled: false,
  payoutsEnabled: false,
  connectedAt: null,
}

export function useStripeConnectStatus(enabled = true) {
  const query = useQuery<StripeConnectStatusResponse>({
    queryKey: queryKeys.merchants.stripeConnectStatus(),
    queryFn: () => merchantService.getStripeConnectStatus(),
    enabled,
  })

  return {
    data: query.data ?? DEFAULT_STATUS,
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải trạng thái kết nối Stripe'
      : null,
    refetch: () => {
      void query.refetch()
    },
  }
}
