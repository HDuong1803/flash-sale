'use client'

import { useState } from 'react'
import { Zap, Search, Menu } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { useNotificationStore } from '@/stores/notification.store'
import { useLogout } from '@/hooks/mutations/useLogout'
import { NotificationDropdown } from './NotificationDropdown'
import { cn } from '@/lib/utils'

export function TopHeader() {
  const { isAuthenticated, user } = useAuthStore()
  const { openAuthModal, toggleSidebar } = useUiStore()
  const { notifications, markRead, markAllRead } = useNotificationStore()
  const { logout } = useLogout()

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
        <div className="hidden md:flex flex-1 max-w-sm relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Tìm kiếm flash sale..."
            className="input-glass pl-9 text-sm h-9 py-0"
          />
        </div>

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
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
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

interface UserAvatarMenuProps {
  initials: string
  user: { fullName: string; role: string } | null
  onLogout: () => void
}

function UserAvatarMenu({ initials, user, onLogout }: UserAvatarMenuProps) {
  const [open, setOpen] = useState(false)

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
              <p className="text-white/40 text-xs capitalize">{user?.role?.toLowerCase()}</p>
            </div>
            <div className="p-2">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white hover:bg-white/8 rounded-xl text-sm transition-all"
              >
                Hồ sơ cá nhân
              </Link>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white hover:bg-white/8 rounded-xl text-sm transition-all text-left">
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
