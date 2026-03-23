import { useState } from 'react'
import { authService } from '@/services/auth.service'
import { useAuthContext } from '@/contexts/auth-context'

export function useLogout() {
  const [loading, setLoading] = useState(false)
  const { logout } = useAuthContext()

  const handleLogout = async () => {
    setLoading(true)
    try {
      await authService.logout()
    } finally {
      logout()
      setLoading(false)
    }
  }

  return { logout: handleLogout, loading }
}
