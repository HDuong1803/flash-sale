'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'
import type { PaymentGatewayConfig, PaymentMethod } from '@/types'

type UpdatePayload = Partial<Pick<PaymentGatewayConfig, 'enabled' | 'isDefault' | 'displayName' | 'config'>>

export function useUpdatePaymentGatewayConfig() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const updateGateway = async (gateway: PaymentMethod, payload: UpdatePayload) => {
    setLoading(true)
    try {
      const result = await adminService.updatePaymentGatewayConfig(gateway, payload)
      toast.success('Đã cập nhật cấu hình cổng thanh toán')
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.paymentGateways() })
      await queryClient.invalidateQueries({ queryKey: queryKeys.checkout.paymentMethods() })
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cập nhật cấu hình thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updateGateway, loading }
}

