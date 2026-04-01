import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { PaymentGatewayConfig } from '@/types'

export function usePaymentGatewayConfigs() {
  const query = useQuery<PaymentGatewayConfig[]>({
    queryKey: queryKeys.admin.paymentGateways(),
    queryFn: () => adminService.getPaymentGatewayConfigs(),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải cấu hình cổng thanh toán'
      : null,
    refetch: () => { void query.refetch() },
  }
}

