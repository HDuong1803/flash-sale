import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { ApiError } from '@/lib/api-client'

export function useRegister() {
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const closeAuthModal = useUiStore((s) => s.closeAuthModal)

  const register = async (data: {
    fullName: string
    email: string
    password: string
  }) => {
    setLoading(true)
    try {
      const { user } = await authService.register(data)
      setAuth(user)
      closeAuthModal()
      toast.success(`Chào mừng, ${user.fullName}! Đăng ký thành công.`)
      return user
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Đăng ký thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { register, loading }
}
