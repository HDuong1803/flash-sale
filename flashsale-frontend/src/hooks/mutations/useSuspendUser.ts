import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useSuspendUser() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const mutate = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.suspendUser(id)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('Đã khóa tài khoản')
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
