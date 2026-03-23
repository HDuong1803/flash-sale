'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthContext } from '@/contexts/auth-context'

export default function RootPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthContext()

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace('/campaigns')
      return
    }
    if (user.role === 'ADMIN') {
      router.replace('/admin/overview')
    } else {
      router.replace('/campaigns')
    }
  }, [isAuthenticated, user, router])

  return null
}
