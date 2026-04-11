import { useState } from 'react'
import { toast } from 'sonner'
import { orderService } from '@/services/order.service'
import { ApiError } from '@/lib/api-client'

export function useCancelReservation() {
  const [loading, setLoading] = useState(false)

  const cancel = async (reservationId: string): Promise<boolean> => {
    setLoading(true)
    try {
      await orderService.cancelReservation(reservationId)
      toast.success('Đã huỷ giữ chỗ thành công')
      return true
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không thể huỷ giữ chỗ'
      toast.error(message)
      return false
    } finally {
      setLoading(false)
    }
  }

  return { cancel, loading }
}
