'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { TopHeader } from '@/components/shared/TopHeader'
import { AppSidebar } from '@/components/shared/AppSidebar'
import { AuthModal } from '@/components/shared/AuthModal'
import { AnimatedBackground } from '@/components/shared/AnimatedBackground'
import { cn } from '@/lib/utils'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  const { sidebarCollapsed, openAuthModal } = useUiStore()

  useEffect(() => {
    if (sessionStorage.getItem('auth:session-expired')) {
      sessionStorage.removeItem('auth:session-expired')
      openAuthModal('login')
    }
  }, [openAuthModal])

  return (
    <div className="min-h-screen">
      <AnimatedBackground />
      <TopHeader />
      {isAuthenticated && <AppSidebar />}
      <AuthModal />
      <main className={cn(
        'min-h-[calc(100vh-4rem)] pt-16 transition-all duration-300',
        isAuthenticated && (sidebarCollapsed ? 'pl-16' : 'pl-60'),
      )}>
        <div className="p-4 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
