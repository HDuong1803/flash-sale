'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Zap, ShoppingBag, Store, LayoutDashboard, Package,
  ClipboardList, Users, AlertTriangle, Server,
  Sparkles, ChevronLeft,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { useAdminMerchants } from '@/hooks/queries/useAdminMerchants'
import { useAdminCampaigns } from '@/hooks/queries/useAdminCampaigns'
import { useApplicationStatus } from '@/hooks/queries/useApplicationStatus'
import { cn } from '@/lib/utils'
import type { Permission, CampaignStatus } from '@/types'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  permission: Permission
  badge?: number
  section?: string
}

const NAV_ITEMS: NavItem[] = [
  // ── Flash Sale (everyone) ──────────────────────────────
  { label: 'Flash Sale',  href: '/campaigns',               icon: Zap,            permission: 'browse_campaigns' },
  { label: 'Đơn hàng',    href: '/orders',                  icon: ShoppingBag,    permission: 'view_own_orders' },

  // ── Merchant section ───────────────────────────────────
  { label: 'Dashboard',   href: '/merchant/dashboard',      icon: LayoutDashboard, permission: 'view_merchant_dashboard', section: 'Merchant' },
  { label: 'Chiến dịch',  href: '/merchant/campaigns',     icon: Zap,            permission: 'create_campaign' },
  { label: 'Sản phẩm',    href: '/merchant/products',      icon: Package,        permission: 'manage_products' },
  { label: 'Đơn nhận',    href: '/merchant/orders',        icon: ClipboardList,  permission: 'view_merchant_orders' },

  // ── Admin section ──────────────────────────────────────
  { label: 'Tổng quan',   href: '/admin/overview',          icon: LayoutDashboard, permission: 'admin_approve',  section: 'Admin' },
  { label: 'Merchants',   href: '/admin/merchants',         icon: Store,          permission: 'admin_approve' },
  { label: 'Chiến dịch',  href: '/admin/campaigns',        icon: Zap,            permission: 'admin_approve' },
  { label: 'Người dùng',  href: '/admin/users',            icon: Users,          permission: 'admin_users' },
  { label: 'Dead Letter', href: '/admin/dead-letter-queue', icon: AlertTriangle,  permission: 'admin_system' },
  { label: 'Hệ thống',    href: '/admin/system',           icon: Server,         permission: 'admin_system' },
]

function NavItemRow({ item, pathname, collapsed }: {
  item: NavItem & { badge?: number }
  pathname: string
  collapsed: boolean
}) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const Icon = item.icon

  return (
    <Link href={item.href}>
      <div className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all relative',
        isActive
          ? 'bg-indigo-500/15 border-l-2 border-indigo-500 text-indigo-300'
          : 'text-white/60 hover:bg-white/8 hover:text-white',
        collapsed && 'justify-center px-2',
      )}>
        <Icon size={18} className="shrink-0" />
        {!collapsed && (
          <>
            <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
            {(item.badge ?? 0) > 0 && (
              <span className="ml-auto bg-red-500/80 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                {item.badge}
              </span>
            )}
          </>
        )}
        {collapsed && (item.badge ?? 0) > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </div>
    </Link>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { hasPermission, user } = useAuthStore()
  const { sidebarCollapsed } = useUiStore()

  // Pending badges — only meaningful for admin, but hooks must be called unconditionally
  const { data: pendingMerchants } = useAdminMerchants(
    user?.role === 'ADMIN' ? 'PENDING' : undefined
  )
  const { data: pendingCampaigns } = useAdminCampaigns(
    user?.role === 'ADMIN' ? 'DRAFT' as CampaignStatus : undefined
  )

  // Application status — for the Merchant CTA
  const { data: application } = useApplicationStatus()

  // Filter items by permission
  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.permission))

  // Add badge counts to relevant items
  const itemsWithBadges = visibleItems.map((item) => ({
    ...item,
    badge:
      item.href === '/admin/merchants' ? (pendingMerchants?.length ?? 0)
      : item.href === '/admin/campaigns' ? (pendingCampaigns?.length ?? 0)
      : 0,
  }))

  // Group by section
  const sections: Record<string, typeof itemsWithBadges> = {}
  const unsectioned: typeof itemsWithBadges = []
  for (const item of itemsWithBadges) {
    if (item.section) {
      sections[item.section] = [...(sections[item.section] ?? []), item]
    } else {
      unsectioned.push(item)
    }
  }

  return (
    <aside className={cn(
      'fixed left-0 top-16 h-[calc(100vh-4rem)] z-40',
      'glass border-r border-white/10 flex flex-col',
      'transition-all duration-300',
      sidebarCollapsed ? 'w-16' : 'w-60',
    )}>
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">

        {/* Unsectioned items */}
        {unsectioned.map((item) => (
          <NavItemRow key={item.href} item={item} pathname={pathname} collapsed={sidebarCollapsed} />
        ))}

        {/* Sectioned items */}
        {Object.entries(sections).map(([section, items]) => (
          <div key={section} className="mt-4">
            {!sidebarCollapsed && (
              <p className="px-3 mb-1 text-xs font-medium text-white/30 uppercase tracking-wider">
                {section}
              </p>
            )}
            {sidebarCollapsed && <div className="border-t border-white/10 my-1" />}
            {items.map((item) => (
              <NavItemRow key={item.href} item={item} pathname={pathname} collapsed={sidebarCollapsed} />
            ))}
          </div>
        ))}

        {/* Apply Merchant CTA — only CUSTOMER who hasn't applied yet */}
        {hasPermission('apply_merchant') && user?.role === 'CUSTOMER' && (
          <div className="mt-4 pt-4 border-t border-white/10">
            {!sidebarCollapsed && (
              <Link href="/merchant/apply">
                <div className={cn(
                  'glass-brand rounded-xl px-3 py-3 cursor-pointer',
                  'flex items-center gap-3',
                  application?.status === 'PENDING'
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:bg-indigo-500/20',
                )}>
                  <Sparkles size={18} className="text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-indigo-300 truncate">
                      {application?.status === 'PENDING'
                        ? 'Đang chờ duyệt...'
                        : 'Đăng ký Merchant'}
                    </p>
                    {!application && (
                      <p className="text-xs text-indigo-400/60">Mở rộng kinh doanh</p>
                    )}
                  </div>
                </div>
              </Link>
            )}
            {sidebarCollapsed && (
              <Link href="/merchant/apply">
                <div className="flex justify-center p-2">
                  <Sparkles size={18} className="text-indigo-400" />
                </div>
              </Link>
            )}
          </div>
        )}

      </nav>

      {/* User info at bottom */}
      {!sidebarCollapsed && user && (
        <div className="p-3 border-t border-white/10">
          <Link href="/profile">
            <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-all">
              <div className="w-8 h-8 rounded-full bg-indigo-600/40 flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-indigo-300">
                  {user.fullName?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white/90 truncate">{user.fullName}</p>
                <p className="text-xs text-white/40 truncate">{user.email}</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => useUiStore.getState().toggleSidebar()}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full glass border border-white/20
                   flex items-center justify-center hover:bg-white/10 transition-all"
      >
        <ChevronLeft size={12} className={cn('text-white/50 transition-transform', sidebarCollapsed && 'rotate-180')} />
      </button>
    </aside>
  )
}
