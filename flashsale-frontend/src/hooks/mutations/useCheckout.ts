import { useState } from 'react'
import { toast } from 'sonner'
import { checkoutService, type CheckoutDto } from '@/services/checkout.service'
import { getOrCreateKey, clearKey } from '@/lib/idempotency'

export function useCheckout() {
  const [loading, setLoading] = useState(false)

  const checkout = async (data: CheckoutDto) => {
    setLoading(true)
    try {
      const idempotencyKey = getOrCreateKey(`checkout:${data.reservationId}`)
      const result = await checkoutService.initiate(data)
      clearKey(`checkout:${data.reservationId}`)
      toast.success('Đặt hàng thành công!')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Thanh toán thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { checkout, loading }
}
