'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, Clock, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTimeAgo } from '@/lib/utils'
import type { Notification } from '@/types'

interface NotificationDropdownProps {
  notifications: Notification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
}

const typeConfig = {
  RESERVATION_EXPIRING:           { border: 'border-l-orange-500', icon: Clock, iconColor: 'text-orange-400' },
  ORDER_CONFIRMED:                { border: 'border-l-emerald-500', icon: CheckCircle, iconColor: 'text-emerald-400' },
  PAYMENT_FAILED:                 { border: 'border-l-red-500', icon: XCircle, iconColor: 'text-red-400' },
  CAMPAIGN_STARTING:              { border: 'border-l-blue-500', icon: Bell, iconColor: 'text-blue-400' },
  CAMPAIGN_RESCHEDULED:           { border: 'border-l-yellow-500', icon: Clock, iconColor: 'text-yellow-400' },
  RESCHEDULE_CONFIRMATION_NEEDED: { border: 'border-l-violet-500', icon: Bell, iconColor: 'text-violet-400' },
  SYSTEM_ALERT:                   { border: 'border-l-rose-500', icon: Bell, iconColor: 'text-rose-300' },
}

const defaultConfig = { border: 'border-l-white/20', icon: Bell, iconColor: 'text-white/40' }

export function NotificationDropdown({ notifications, onMarkRead, onMarkAllRead }: NotificationDropdownProps) {
  const [open, setOpen] = useState(false)
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-white/70 hover:text-white transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full text-xs flex items-center justify-center text-white font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 z-50 glass-strong rounded-2xl shadow-glass-lg animate-slide-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-white font-semibold text-sm">Thông báo</span>
              {unreadCount > 0 && (
                <button onClick={onMarkAllRead} className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors">
                  Đọc tất cả
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell size={32} className="text-white/20 mb-2" />
                  <p className="text-white/40 text-sm">Không có thông báo</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {notifications.map((n) => {
                    const cfg = typeConfig[n.type] ?? defaultConfig
                    const Icon = cfg.icon
                    return (
                      <button
                        key={n.id}
                        onClick={() => onMarkRead(n.id)}
                        className={cn(
                          'w-full text-left rounded-xl p-3 border-l-4 transition-all',
                          cfg.border,
                          n.read ? 'bg-transparent' : 'bg-white/5',
                          'hover:bg-white/8'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Icon size={16} className={cn('mt-0.5 flex-shrink-0', cfg.iconColor)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-white/80 text-xs font-medium truncate">{n.title}</p>
                            <p className="text-white/50 text-xs mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-white/30 text-xs mt-1">{formatTimeAgo(n.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-white/10 px-4 py-2">
              <Link href="/notifications" className="block w-full text-center text-indigo-400 text-xs hover:text-indigo-300 transition-colors py-1">
                Xem tất cả
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
