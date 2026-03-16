import { useState } from 'react'
import { toast } from 'sonner'
import { orderService } from '@/services/order.service'
import { getOrCreateKey, clearKey } from '@/lib/idempotency'

export function usePurchase() {
  const [loading, setLoading] = useState(false)

  const purchase = async (campaignProductId: string, quantity: number) => {
    setLoading(true)
    try {
      const idempotencyKey = getOrCreateKey(`purchase:${campaignProductId}`)
      const result = await orderService.purchase({ campaignProductId, quantity, idempotencyKey })
      clearKey(`purchase:${campaignProductId}`)
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mua hàng thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { purchase, loading }
}
