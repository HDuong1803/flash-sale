'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Zap, ShoppingBag, LayoutDashboard, Megaphone, Package, ClipboardList, UserCheck, User } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { cn } from '@/lib/utils'
import type { Permission } from '@/types'

interface NavItem {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  href: string
  permission?: Permission
  hideIfMerchant?: boolean
  highlight?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { icon: Zap,           label: 'Flash Sale',         href: '/campaigns',          permission: 'browse_campaigns' },
  { icon: ShoppingBag,   label: 'Đơn hàng',           href: '/orders',             permission: 'view_own_orders' },
]

const MERCHANT_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard',         href: '/merchant/dashboard', permission: 'view_merchant_dashboard' },
  { icon: Megaphone,       label: 'Chiến dịch',        href: '/merchant/campaigns', permission: 'create_campaign' },
  { icon: Package,         label: 'Sản phẩm',          href: '/merchant/products',  permission: 'manage_products' },
  { icon: ClipboardList,   label: 'Đơn nhận',          href: '/merchant/orders',    permission: 'view_merchant_orders' },
]

const BOTTOM_ITEMS: NavItem[] = [
  { icon: UserCheck, label: '✨ Đăng ký Merchant', href: '/merchant/apply', permission: 'apply_merchant', highlight: true, hideIfMerchant: true },
  { icon: User,      label: 'Hồ sơ',              href: '/profile' },
]

interface AppSidebarProps {
  collapsed: boolean
}

export function AppSidebar({ collapsed }: AppSidebarProps) {
  const pathname = usePathname()
  const { hasPermission, user, merchantApplicationStatus } = useAuthStore()

  const visibleNav = NAV_ITEMS.filter((item) => !item.permission || hasPermission(item.permission))
  const visibleMerchant = MERCHANT_ITEMS.filter((item) => !item.permission || hasPermission(item.permission))
  const visibleBottom = BOTTOM_ITEMS.filter((item) => {
    if (item.hideIfMerchant && user?.role === 'MERCHANT') return false
    if (item.permission && !hasPermission(item.permission)) return false
    return true
  })

  const isPending = merchantApplicationStatus === 'PENDING'

  return (
    <aside className={cn(
      'fixed left-0 top-16 bottom-0 z-40 glass border-r border-white/10 flex flex-col transition-all duration-300',
      collapsed ? '-translate-x-full md:translate-x-0 md:w-16' : 'translate-x-0 w-60',
    )}>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {visibleNav.map((item) => (
          <SidebarItem key={item.href} item={item} collapsed={collapsed} active={pathname === item.href || pathname.startsWith(item.href + '/')} />
        ))}

        {visibleMerchant.length > 0 && (
          <>
            {!collapsed && (
              <div className="px-3 py-2 mt-2">
                <p className="text-white/30 text-xs font-semibold uppercase tracking-wider">Merchant</p>
              </div>
            )}
            {collapsed && <div className="border-t border-white/10 my-1" />}
            {visibleMerchant.map((item) => (
              <SidebarItem key={item.href} item={item} collapsed={collapsed} active={pathname === item.href || pathname.startsWith(item.href + '/')} />
            ))}
          </>
        )}
      </nav>

      <div className="p-2 space-y-1 border-t border-white/10">
        {visibleBottom.map((item) => {
          if (item.href === '/merchant/apply') {
            if (isPending) {
              return (
                <div key={item.href} className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl glass-brand opacity-60',
                  collapsed && 'justify-center',
                )}>
                  <item.icon size={18} className="text-indigo-300 flex-shrink-0" />
                  {!collapsed && <span className="text-indigo-300 text-sm">Đang chờ duyệt...</span>}
                </div>
              )
            }
            return (
              <SidebarItem key={item.href} item={item} collapsed={collapsed} active={pathname === item.href} highlight />
            )
          }
          return (
            <SidebarItem key={item.href} item={item} collapsed={collapsed} active={pathname === item.href} />
          )
        })}
      </div>
    </aside>
  )
}

function SidebarItem({ item, collapsed, active, highlight }: {
  item: NavItem; collapsed: boolean; active: boolean; highlight?: boolean
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium',
        collapsed && 'justify-center',
        active
          ? 'bg-indigo-500/15 border-l-2 border-indigo-500 text-indigo-300'
          : highlight
          ? 'glass-brand text-indigo-300 hover:bg-indigo-500/20'
          : 'text-white/60 hover:text-white hover:bg-white/8',
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon size={18} className="flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  )
}
