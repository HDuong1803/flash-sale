import { useCallback } from 'react'
import { orderService } from '@/services/order.service'
import { usePolling } from '@/hooks/usePolling'
import type { PurchaseResult } from '@/types'

export function usePurchaseResult(requestId: string) {
  const fetchFn = useCallback(() => orderService.getResult(requestId), [requestId])
  const stopCondition = useCallback((d: PurchaseResult) => d?.status !== 'PROCESSING', [])

  return usePolling<PurchaseResult>(fetchFn, 2000, stopCondition, 30)
}
