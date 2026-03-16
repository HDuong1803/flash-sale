import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { ApiError } from '@/lib/api-client'

export function useGoogleLogin() {
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const closeAuthModal = useUiStore((s) => s.closeAuthModal)

  const loginWithGoogle = async (googleToken: string) => {
    setLoading(true)
    try {
      const { user } = await authService.loginWithGoogle(googleToken)
      setAuth(user)
      closeAuthModal()
      toast.success(`Chào mừng, ${user.fullName}!`)
      return user
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Đăng nhập Google thất bại',
      )
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { loginWithGoogle, loading }
}
