import { useState } from 'react'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useRetryJob() {
  const [loading, setLoading] = useState(false)

  const mutate = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.retryJob(id)
      toast.success('Đã thêm vào hàng đợi thử lại')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { mutate, loading }
}
