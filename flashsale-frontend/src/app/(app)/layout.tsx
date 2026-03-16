'use client'

import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { TopHeader } from '@/components/shared/TopHeader'
import { AppSidebar } from '@/components/shared/AppSidebar'
import { AuthModal } from '@/components/shared/AuthModal'
import { AnimatedBackground } from '@/components/shared/AnimatedBackground'
import { cn } from '@/lib/utils'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUiStore()

  return (
    <div className="min-h-screen">
      <AnimatedBackground />
      <TopHeader />
      <div className="flex pt-16">
        {isAuthenticated && (
          <>
            {/* Mobile overlay when sidebar is open */}
            {!sidebarCollapsed && (
              <div
                className="fixed inset-0 z-30 bg-black/50 md:hidden"
                onClick={toggleSidebar}
              />
            )}
            <AppSidebar collapsed={sidebarCollapsed} />
          </>
        )}
        <main className={cn(
          'flex-1 min-h-[calc(100vh-4rem)] p-4 sm:p-6 transition-all duration-300',
          isAuthenticated && !sidebarCollapsed && 'md:ml-60',
          isAuthenticated && sidebarCollapsed && 'md:ml-16',
        )}>
          {children}
        </main>
      </div>
      <AuthModal />
    </div>
  )
}
