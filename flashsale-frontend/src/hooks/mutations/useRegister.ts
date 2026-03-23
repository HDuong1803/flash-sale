import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { ApiError } from '@/lib/api-client'

export function useRegister() {
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthContext()
  const { closeAuthModal } = useUiContext()

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
      // Sync user-role cookie for middleware route protection
      if (typeof document !== 'undefined') {
        document.cookie = `user-role=${user.role}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`
      }
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
