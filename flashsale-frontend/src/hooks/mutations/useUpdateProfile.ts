import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { useAuthContext } from '@/contexts/auth-context'
import { ApiError } from '@/lib/api-client'

export function useUpdateProfile() {
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthContext()

  const update = async (dto: { fullName?: string }, file?: File) => {
    setLoading(true)
    try {
      const updated = await authService.updateProfile(dto, file)
      setAuth(updated)
      toast.success('Cập nhật thông tin thành công!')
      return updated
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Cập nhật thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { update, loading }
}
