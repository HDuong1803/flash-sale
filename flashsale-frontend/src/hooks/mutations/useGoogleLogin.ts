import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { ApiError } from '@/lib/api-client'

export function useGoogleLogin() {
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthContext()
  const { closeAuthModal } = useUiContext()

  const loginWithGoogle = async (googleToken: string) => {
    setLoading(true)
    try {
      const { user } = await authService.loginWithGoogle(googleToken)
      setAuth(user)
      closeAuthModal()
      toast.success(`Chào mừng, ${user.fullName}!`)
      // Sync user-role cookie for middleware route protection
      if (typeof document !== 'undefined') {
        document.cookie = `user-role=${user.role}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`
      }
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
