'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'

export default function HomePage() {
  const { isAuthenticated, user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (isAuthenticated && user?.role === 'ADMIN') {
      router.replace('/admin/overview')
    } else {
      router.replace('/campaigns')
    }
  }, [isAuthenticated, user, router])

  return null
}
