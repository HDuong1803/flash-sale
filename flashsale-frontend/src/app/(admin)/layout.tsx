'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Store, Zap, Users, AlertTriangle, Server, Menu, X } from 'lucide-react'
import { TopHeader } from '@/components/shared/TopHeader'
import { AuthModal } from '@/components/shared/AuthModal'
import { AnimatedBackground } from '@/components/shared/AnimatedBackground'
import { useAdminMerchants } from '@/hooks/queries/useAdminMerchants'
import { useAdminCampaigns } from '@/hooks/queries/useAdminCampaigns'
import { useDeadLetterJobs } from '@/hooks/queries/useDeadLetterJobs'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Tổng quan',    href: '/admin/overview' },
  { icon: Store,           label: 'Merchants',     href: '/admin/merchants',         badge: 'merchants' },
  { icon: Zap,             label: 'Chiến dịch',   href: '/admin/campaigns',         badge: 'campaigns' },
  { icon: Users,           label: 'Người dùng',   href: '/admin/users' },
  { icon: AlertTriangle,   label: 'Dead Letter',  href: '/admin/dead-letter-queue', badge: 'jobs' },
  { icon: Server,          label: 'Hệ thống',     href: '/admin/system' },
] as const

function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { data: pendingMerchants } = useAdminMerchants('PENDING')
  const { data: pendingCampaigns } = useAdminCampaigns('PENDING')
  const { data: failedJobs } = useDeadLetterJobs()

  const getBadge = (badge?: string) => {
    if (badge === 'merchants') return pendingMerchants.length
    if (badge === 'campaigns') return pendingCampaigns.length
    if (badge === 'jobs') return failedJobs.length
    return 0
  }

  return (
    <aside className={cn(
      'fixed left-0 top-16 bottom-0 z-40 w-60 glass border-r border-white/10 flex flex-col transition-all duration-300',
      open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    )}>
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <p className="text-red-400 text-xs font-bold uppercase tracking-wider">Admin Panel</p>
        <button onClick={onClose} className="p-1 text-white/40 hover:text-white md:hidden transition-colors">
          <X size={16} />
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const count = 'badge' in item ? getBadge(item.badge) : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-red-500/15 border-l-2 border-red-500 text-red-300'
                  : 'text-white/60 hover:text-white hover:bg-white/8'
              )}
            >
              <span className="flex items-center gap-3">
                <item.icon size={18} />
                {item.label}
              </span>
              {count > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <AnimatedBackground />
      {/* Mobile sidebar toggle button injected via TopHeader area — use a floating button */}
      <TopHeader />
      {/* Mobile hamburger for admin */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-[1.1rem] left-16 z-50 p-2 text-white/60 hover:text-white transition-colors md:hidden"
        aria-label="Open admin menu"
      >
        <Menu size={20} />
      </button>
      <div className="flex pt-16">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 min-h-[calc(100vh-4rem)] p-4 sm:p-6 md:ml-60">
          {children}
        </main>
      </div>
      <AuthModal />
    </div>
  )
}
