'use client'

import { useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useGoogleLogin } from '@/hooks/mutations/useGoogleLogin'

declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: object) => void
          prompt: () => void
        }
      }
    }
  }
}

export function useGoogleAuth() {
  const { loginWithGoogle, loading } = useGoogleLogin()
  // Use ref so the callback passed to google.initialize never goes stale
  const loginRef = useRef(loginWithGoogle)
  useEffect(() => { loginRef.current = loginWithGoogle }, [loginWithGoogle])

  const initialize = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!window.google || !clientId) return

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: { credential: string }) => {
        await loginRef.current(response.credential)
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    })
  }, []) // stable — reads clientId once, loginRef always fresh

  const signIn = useCallback(() => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      toast.warning('Google OAuth chưa được cấu hình. Vui lòng dùng email/password.')
      return
    }
    if (!window.google) {
      toast.warning('Google đang tải, vui lòng thử lại sau giây lát.')
      return
    }
    window.google.accounts.id.prompt()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.google) {
      initialize()
    } else {
      window.addEventListener('load', initialize)
      return () => window.removeEventListener('load', initialize)
    }
  }, [initialize])

  return { signIn, loading }
}
