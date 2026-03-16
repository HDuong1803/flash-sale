import { useState } from 'react'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useApproveMerchant() {
  const [loading, setLoading] = useState(false)

  const approve = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.approveMerchant(id)
      toast.success('Đã duyệt merchant!')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { approve, loading }
}
