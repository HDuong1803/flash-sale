'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Zap, ShoppingBag, Bell, LayoutGrid, LayoutDashboard,
  Megaphone, Package, ClipboardList, BarChart2, Store,
  CreditCard, Users, Building2, UserCheck, BellRing,
  ClipboardCheck, AlertTriangle, ScrollText, Radio, Server,
  Sparkles, ChevronLeft,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { useAdminMerchants } from '@/hooks/queries/useAdminMerchants'
import { useAdminCampaigns } from '@/hooks/queries/useAdminCampaigns'
import { useApplicationStatus } from '@/hooks/queries/useApplicationStatus'
import { NAV_ITEMS, SECTION_ORDER } from '@/config/navigation'
import type { NavItem } from '@/config/navigation'
import { cn } from '@/lib/utils'
import type { CampaignStatus } from '@/types'

// ── Icon resolver ─────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  Zap, ShoppingBag, Bell, LayoutGrid, LayoutDashboard,
  Megaphone, Package, ClipboardList, BarChart2, Store,
  CreditCard, Users, Building2, UserCheck, BellRing,
  ClipboardCheck, AlertTriangle, ScrollText, Radio, Server,
}

type NavItemWithBadge = NavItem & { badge?: number }

function NavItemRow({ item, pathname, collapsed, onNavigate }: {
  item: NavItemWithBadge
  pathname: string
  collapsed: boolean
  onNavigate?: () => void
}) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const Icon = ICON_MAP[item.iconName] ?? Zap

  return (
    <Link href={item.href} onClick={onNavigate}>
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
  const { hasPermission, user, merchantApplicationStatus } = useAuthContext()
  const { sidebarCollapsed, setSidebarCollapsed } = useUiContext()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleNavClick = () => {
    if (isMobile) setSidebarCollapsed(true)
  }

  // Pending badges — only fetch for ADMIN; hooks called unconditionally per React rules
  const isAdmin = user?.role === 'ADMIN'
  const { data: pendingMerchants } = useAdminMerchants('PENDING', isAdmin)
  const { data: pendingCampaigns } = useAdminCampaigns('DRAFT' as CampaignStatus, isAdmin)

  // Application status — for the Merchant CTA (CUSTOMER role only)
  const { data: application } = useApplicationStatus()

  // Filter items by permission
  const visibleItems: NavItemWithBadge[] = NAV_ITEMS
    .filter((item) => hasPermission(item.permission))
    .map((item) => ({
      ...item,
      badge:
        item.href === '/admin/merchants' ? (pendingMerchants?.length ?? 0)
        : item.href === '/admin/campaigns' ? (pendingCampaigns?.length ?? 0)
        : 0,
    }))

  // Group items into ordered sections
  const sections = SECTION_ORDER
    .map((sectionKey) => {
      const items = visibleItems.filter((i) => i.section === sectionKey)
      const sectionLabel = items.find((i) => i.sectionLabel)?.sectionLabel
      return { key: sectionKey, label: sectionLabel, items }
    })
    .filter((s) => s.items.length > 0)

  const isCollapsed = !isMobile && sidebarCollapsed
  const mobileHidden = isMobile && sidebarCollapsed

  // Merchant pending: role is MERCHANT but shop management permissions absent
  // (i.e. kycStatus is PENDING or REJECTED — not APPROVED)
  const isMerchantPending =
    user?.role === 'MERCHANT' && !hasPermission('view_shop_dashboard')

  return (
    <aside className={cn(
      'fixed left-0 top-16 h-[calc(100vh-4rem)] z-40',
      'glass border-r border-white/10 flex flex-col',
      'transition-all duration-300',
      // Desktop: collapsed → icon-only (w-16), expanded → full (w-60)
      !isMobile && (sidebarCollapsed ? 'w-16' : 'w-60'),
      // Mobile: full-width overlay, hidden when collapsed
      isMobile && 'w-60',
      mobileHidden && '-translate-x-full',
    )}>
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">

        {sections.map((section) => (
          <div key={section.key} className="mt-2 first:mt-0">
            {/* Section header — only when expanded */}
            {section.label && !isCollapsed && (
              <p className="px-3 mb-1 mt-3 first:mt-0 text-xs font-semibold text-white/30 uppercase tracking-wider">
                {section.label}
              </p>
            )}
            {/* Divider when collapsed */}
            {isCollapsed && (
              <div className="border-t border-white/10 my-2 first:hidden" />
            )}
            {section.items.map((item) => (
              <NavItemRow
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={isCollapsed}
                onNavigate={handleNavClick}
              />
            ))}
          </div>
        ))}

        {/* Merchant pending banner — shown only when sidebar is expanded */}
        {isMerchantPending && !isCollapsed && (
          <div className="glass rounded-xl p-3 mx-1 mt-4 border border-amber-400/20">
            <p className="text-amber-300/80 text-xs font-medium mb-0.5">
              {merchantApplicationStatus === 'PENDING'
                ? 'Shop đang chờ duyệt'
                : merchantApplicationStatus === 'REJECTED'
                  ? 'Đơn đăng ký bị từ chối'
                  : 'Shop chưa được duyệt'}
            </p>
            <p className="text-amber-400/50 text-[11px]">
              {merchantApplicationStatus === 'REJECTED'
                ? 'Liên hệ admin để biết thêm'
                : 'Vui lòng chờ admin xét duyệt'}
            </p>
          </div>
        )}

        {/* Apply Merchant CTA — only CUSTOMER who hasn't applied or been rejected */}
        {user?.role === 'CUSTOMER' && (
          <div className="mt-4 pt-4 border-t border-white/10">
            {!isCollapsed && (
              <Link href="/merchant/apply" onClick={handleNavClick}>
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
            {isCollapsed && (
              <Link href="/merchant/apply" onClick={handleNavClick}>
                <div className="flex justify-center p-2">
                  <Sparkles size={18} className="text-indigo-400" />
                </div>
              </Link>
            )}
          </div>
        )}

      </nav>

      {/* User info at bottom */}
      {(!sidebarCollapsed || isMobile) && user && (
        <div className="p-3 border-t border-white/10">
          <Link href="/profile" onClick={handleNavClick}>
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
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full glass border border-white/20
                   flex items-center justify-center hover:bg-white/10 transition-all"
      >
        <ChevronLeft size={12} className={cn('text-white/50 transition-transform', sidebarCollapsed && 'rotate-180')} />
      </button>
    </aside>
  )
}
