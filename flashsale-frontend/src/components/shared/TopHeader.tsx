'use client'

import { useState, useEffect, useRef } from 'react'
import { Zap, Search, Menu, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { useNotifications } from '@/hooks/queries/useNotifications'
import { useMarkReadNotification } from '@/hooks/mutations/useMarkReadNotification'
import { useMarkAllReadNotifications } from '@/hooks/mutations/useMarkAllReadNotifications'
import { useLogout } from '@/hooks/mutations/useLogout'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { NotificationDropdown } from './NotificationDropdown'

export function TopHeader() {
  const { isAuthenticated, user } = useAuthContext()
  const { openAuthModal, toggleSidebar } = useUiContext()
  const { data: notifications } = useNotifications()
  const { markRead } = useMarkReadNotification()
  const { markAllRead } = useMarkAllReadNotifications()
  const { logout } = useLogout()
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchParams.get('search') ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync search input with URL param when navigating
  useEffect(() => {
    setTimeout(() => setSearchValue(searchParams.get('search') ?? ''), 0)
  }, [searchParams])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = searchValue.trim()
    const params = new URLSearchParams()
    if (trimmed) params.set('search', trimmed)
    // Always navigate to campaigns page for search
    router.push(`/campaigns${trimmed ? `?${params.toString()}` : ''}`)
  }

  const handleClearSearch = () => {
    setSearchValue('')
    if (pathname === '/campaigns') router.push('/campaigns')
    inputRef.current?.focus()
  }

  const handleMarkRead = async (id: string) => {
    await markRead(id)
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() })
  }

  const handleMarkAllRead = async () => {
    await markAllRead()
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() })
  }

  const initials = user?.fullName
    ? user.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10 h-16">
      <div className="h-full flex items-center justify-between px-4 md:px-6 gap-4">
        {/* Left: hamburger + logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isAuthenticated && (
            <button
              onClick={toggleSidebar}
              className="p-2 text-white/60 hover:text-white transition-colors md:hidden"
            >
              <Menu size={20} />
            </button>
          )}
          <Link href="/" className="flex items-center gap-1.5">
            <Zap size={22} className="text-indigo-400 fill-indigo-400" />
            <span className="font-bold text-lg">
              <span className="text-white">Flash</span>
              <span className="text-indigo-400">Sale</span>
            </span>
          </Link>
        </div>

        {/* Center: search (desktop) */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-sm relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Tìm kiếm chiến dịch..."
            className="input-glass pl-9 pr-8 text-sm h-9 py-0"
          />
          {searchValue && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </form>

        {/* Right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isAuthenticated ? (
            <button
              onClick={() => openAuthModal('login')}
              className="btn-glass text-sm px-4 py-2"
            >
              Đăng nhập
            </button>
          ) : (
            <>
              <NotificationDropdown
                notifications={notifications}
                onMarkRead={handleMarkRead}
                onMarkAllRead={handleMarkAllRead}
              />
              <UserAvatarMenu
                initials={initials}
                user={user}
                onLogout={logout}
              />
            </>
          )}
        </div>
      </div>
    </header>
  )
}

const ROLE_LABELS_VI: Record<string, string> = {
  CUSTOMER: 'Khách hàng',
  MERCHANT: 'Người bán',
  ADMIN: 'Quản trị viên',
}

interface UserAvatarMenuProps {
  initials: string
  user: { fullName: string; role: string } | null
  onLogout: () => void
}

function UserAvatarMenu({ initials, user, onLogout }: UserAvatarMenuProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white transition-all hover:scale-105"
        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 z-50 glass-strong rounded-2xl shadow-glass-lg animate-slide-up">
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-white font-semibold text-sm truncate">{user?.fullName}</p>
              <p className="text-white/40 text-xs">
                {user?.role ? (ROLE_LABELS_VI[user.role] ?? user.role) : ''}
              </p>
            </div>
            <div className="p-2">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white hover:bg-white/8 rounded-xl text-sm transition-all"
              >
                Hồ sơ cá nhân
              </Link>
              <button
                onClick={() => { setOpen(false); router.push('/settings') }}
                className="w-full flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white hover:bg-white/8 rounded-xl text-sm transition-all text-left"
              >
                Cài đặt
              </button>
              <div className="border-t border-white/10 my-1" />
              <button
                onClick={() => { setOpen(false); onLogout() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl text-sm transition-all text-left"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
