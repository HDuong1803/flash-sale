import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { ApiError } from '@/lib/api-client'

export function useLogin() {
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthContext()
  const { closeAuthModal } = useUiContext()

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const { user } = await authService.login(email, password)
      setAuth(user)
      closeAuthModal()
      toast.success(`Chào mừng, ${user.fullName}!`)
      // Write user-role as a non-HttpOnly cookie so the middleware (proxy.ts)
      // can enforce role-based routing without a backend round-trip.
      // SameSite=Lax, no Secure flag (dev), expires in 7 days matching refresh token lifetime.
      if (typeof document !== 'undefined') {
        document.cookie = `user-role=${user.role}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`
        // Handle redirect stored before the auth wall
        const match = document.cookie.match(/auth-redirect=([^;]+)/)
        if (match) {
          document.cookie = 'auth-redirect=; path=/; max-age=0'
          window.location.href = decodeURIComponent(match[1])
        }
      }
      return user
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        throw err  // let caller handle — no toast
      }
      // 401 = wrong credentials — handled inline in the form, no toast needed
      const isCredentialError = err instanceof ApiError && err.statusCode === 401
      if (!isCredentialError) {
        toast.error(err instanceof ApiError ? err.message : 'Đăng nhập thất bại')
      }
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { login, loading }
}
