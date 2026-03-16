import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { ApiError } from '@/lib/api-client'

export function useLogin() {
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const closeAuthModal = useUiStore((s) => s.closeAuthModal)

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const { user } = await authService.login(email, password)
      setAuth(user)
      closeAuthModal()
      toast.success(`Chào mừng, ${user.fullName}!`)
      // Handle redirect stored before the auth wall
      if (typeof document !== 'undefined') {
        const match = document.cookie.match(/auth-redirect=([^;]+)/)
        if (match) {
          document.cookie = 'auth-redirect=; path=/; max-age=0'
          window.location.href = decodeURIComponent(match[1])
        }
      }
      return user
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Đăng nhập thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { login, loading }
}
