import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { ApiError } from '@/lib/api-client'

export function useVerifyOtp() {
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthContext()
  const { closeAuthModal } = useUiContext()

  const verifyOtp = async (email: string, otp: string): Promise<void> => {
    setLoading(true)
    try {
      const { user } = await authService.verifyOtp(email, otp)
      setAuth(user)
      // Sync user-role cookie for middleware
      if (typeof document !== 'undefined') {
        document.cookie = `user-role=${user.role}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`
      }
      // Clear pending email from session storage
      sessionStorage.removeItem('pending_verification_email')
      closeAuthModal()
      toast.success(`Xác minh thành công! Chào mừng, ${user.fullName}!`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Xác minh thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { verifyOtp, loading }
}
