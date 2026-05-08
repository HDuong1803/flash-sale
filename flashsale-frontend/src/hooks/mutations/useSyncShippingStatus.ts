import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { fulfillmentService } from '@/services/fulfillment.service'

export function useSyncShippingStatus() {
  const [loading, setLoading] = useState(false)

  const sync = async (): Promise<{ synced: number; errors: number } | null> => {
    setLoading(true)
    try {
      const result = await fulfillmentService.syncShippingStatuses()
      if (result.synced > 0) {
        toast.success(`Đồng bộ thành công ${result.synced} đơn hàng`)
      } else {
        toast.info('Không có đơn nào cần cập nhật')
      }
      return result
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Đồng bộ thất bại')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { sync, loading }
}
