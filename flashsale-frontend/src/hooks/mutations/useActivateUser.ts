import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'

export function useActivateUser() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const activate = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.activateUser(id)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('Đã kích hoạt tài khoản')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { activate, loading }
}
