import { useState } from 'react'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useRejectCampaign() {
  const [loading, setLoading] = useState(false)

  const reject = async (id: string, reason: string) => {
    setLoading(true)
    try {
      const result = await adminService.rejectCampaign(id, reason)
      toast.success('Đã từ chối chiến dịch')
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
