'use client'

import { Suspense, useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { TopHeader } from '@/components/shared/TopHeader'
import { AppSidebar } from '@/components/shared/AppSidebar'
import { AuthModal } from '@/components/shared/AuthModal'
import { AnimatedBackground } from '@/components/shared/AnimatedBackground'
import { cn } from '@/lib/utils'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrating } = useAuthContext()
  const { sidebarCollapsed, setSidebarCollapsed, openAuthModal } = useUiContext()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('auth:session-expired')) {
      sessionStorage.removeItem('auth:session-expired')
      openAuthModal('login')
    }
  }, [openAuthModal])

  // Mobile detection: collapse sidebar by default on small screens
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setSidebarCollapsed(true)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  // Run once on mount; setSidebarCollapsed is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sidebarOpen = !sidebarCollapsed

  return (
    <div className="min-h-screen">
      <AnimatedBackground />
      <Suspense fallback={<div className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10 h-16" />}>
        <TopHeader />
      </Suspense>
      {(isAuthenticated || isHydrating) && <AppSidebar />}

      {/* Mobile overlay backdrop — shown when sidebar is open on mobile */}
      {isAuthenticated && isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      <AuthModal />
      <main className={cn(
        'min-h-[calc(100vh-4rem)] pt-16 transition-all duration-300',
        isAuthenticated && !isMobile && (sidebarCollapsed ? 'pl-16' : 'pl-60'),
      )}>
        <div className="p-4 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
