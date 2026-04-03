import { useState } from 'react'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useDeleteExpiredCampaign() {
  const [loading, setLoading] = useState(false)

  const deleteExpired = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.deleteExpiredCampaign(id)
      toast.success('Đã xóa chiến dịch đã hết hạn')
      return result
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Xóa chiến dịch hết hạn thất bại'
      )
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteExpired, loading }
}
