import { useState } from 'react'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'

export function useLogout() {
  const [loading, setLoading] = useState(false)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    setLoading(true)
    try {
      await authService.logout()
    } finally {
      logout()
      setLoading(false)
      window.location.href = '/'
    }
  }

  return { logout: handleLogout, loading }
}
