import { useState } from 'react'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useForceStartCampaign() {
  const [loading, setLoading] = useState(false)

  const forceStart = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.forceStartCampaign(id)
      toast.success('Chiến dịch đã được bắt đầu ngay lập tức!')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { forceStart, loading }
}
