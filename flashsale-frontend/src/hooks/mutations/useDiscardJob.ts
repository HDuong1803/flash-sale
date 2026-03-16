import { useState } from 'react'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useDiscardJob() {
  const [loading, setLoading] = useState(false)

  const discard = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.discardJob(id)
      toast.success('Đã loại bỏ job')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { discard, loading }
}
