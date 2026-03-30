import { useState } from 'react'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useForceStopCampaign() {
  const [loading, setLoading] = useState(false)

  const forceStop = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.forceStopCampaign(id)
      toast.success('Chiến dịch đã được dừng ngay lập tức!')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { forceStop, loading }
}
