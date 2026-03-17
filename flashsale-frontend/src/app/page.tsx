'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'

export default function RootPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()

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
