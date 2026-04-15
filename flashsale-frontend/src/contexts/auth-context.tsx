'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as Sentry from '@sentry/nextjs'
import type { KycStatus, Permission, User } from '@/types'
import { ROLE_PERMISSIONS } from '@/lib/permissions'
import { authService } from '@/services/auth.service'

// ─── Types ───────────────────────────────────────────────────────────────────

type MerchantApplicationStatus = 'NONE' | KycStatus

type AuthContextType = {
  user: User | null
  isAuthenticated: boolean
  isHydrating: boolean
  merchantApplicationStatus: MerchantApplicationStatus
  setAuth: (user: User) => void
  setMerchantApplicationStatus: (s: MerchantApplicationStatus) => void
  logout: () => void
  hasPermission: (permission: Permission) => boolean
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null)

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [merchantApplicationStatus, setMerchantApplicationStatus] =
    useState<MerchantApplicationStatus>('NONE')
  // isHydrating: true until we've attempted to restore session from the cookie.
  // Consumers can gate renders that depend on auth state behind this flag.
  const [isHydrating, setIsHydrating] = useState(true)

  const queryClient = useQueryClient()

  const setAuth = useCallback((u: User) => {
    setUser(u)
    // Gắn user identity vào Sentry — mỗi error sau đó sẽ biết thuộc về user nào
    // Giúp ops team filter: "tất cả lỗi của user X" trong Sentry dashboard
    // KHÔNG gửi email/tên đầy đủ để tôn trọng privacy — chỉ id và role là đủ
    Sentry.setUser({ id: u.id, username: u.role })
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setMerchantApplicationStatus('NONE')
    // Xoá user identity khỏi Sentry khi logout — privacy protection
    Sentry.setUser(null)
    // Clear user-role cookie so middleware reverts to unauthenticated state
    if (typeof document !== 'undefined') {
      document.cookie = 'user-role=; path=/; max-age=0; SameSite=Lax'
    }
    // Clear all React Query cache so stale user data is not shown post-logout
    queryClient.clear()
    window.location.href = '/campaigns'
  }, [queryClient])

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      if (!user) return false
      return ROLE_PERMISSIONS[user.role].includes(permission)
    },
    [user],
  )

  useEffect(() => {
    let cancelled = false
    authService.getMe()
      .then((me) => {
        if (!cancelled) {
          setUser(me)
          // Restore Sentry user context sau khi hydrate session từ cookie
          Sentry.setUser({ id: me.id, username: me.role })
        }
      })
      .catch(() => {
        // 401 = no valid session — stay logged out, nothing to do
      })
      .finally(() => {
        if (!cancelled) setIsHydrating(false)
      })
    return () => { cancelled = true }
  }, [])

  // Listen for force-logout events emitted by the api-client 401 handler
  useEffect(() => {
    const handler = () => {
      setUser(null)
      setMerchantApplicationStatus('NONE')
      if (typeof document !== 'undefined') {
        document.cookie = 'user-role=; path=/; max-age=0; SameSite=Lax'
      }
      queryClient.clear()
      toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
      sessionStorage.setItem('auth:session-expired', '1')
      window.location.href = '/campaigns'
    }
    window.addEventListener('auth:force-logout', handler)
    return () => window.removeEventListener('auth:force-logout', handler)
  }, [queryClient])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isHydrating,
        merchantApplicationStatus,
        setAuth,
        setMerchantApplicationStatus,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
