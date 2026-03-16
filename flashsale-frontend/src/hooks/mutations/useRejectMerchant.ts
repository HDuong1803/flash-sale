import { useState } from 'react'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useRejectMerchant() {
  const [loading, setLoading] = useState(false)

  const reject = async (id: string, reason: string) => {
    setLoading(true)
    try {
      const result = await adminService.rejectMerchant(id, reason)
      toast.success('Đã từ chối merchant')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { reject, loading }
}
