'use client'

import { Bell, Clock, CheckCircle, XCircle } from 'lucide-react'
import { useNotifications } from '@/hooks/queries/useNotifications'
import { useMarkReadNotification } from '@/hooks/mutations/useMarkReadNotification'
import { useMarkAllReadNotifications } from '@/hooks/mutations/useMarkAllReadNotifications'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatTimeAgo, cn } from '@/lib/utils'
import type { Notification } from '@/types'

const typeConfig: Record<string, { border: string; icon: typeof Bell; iconColor: string }> = {
  RESERVATION_EXPIRING: { border: 'border-l-orange-500', icon: Clock, iconColor: 'text-orange-400' },
  ORDER_CONFIRMED:       { border: 'border-l-emerald-500', icon: CheckCircle, iconColor: 'text-emerald-400' },
  PAYMENT_FAILED:        { border: 'border-l-red-500', icon: XCircle, iconColor: 'text-red-400' },
  CAMPAIGN_STARTING:     { border: 'border-l-blue-500', icon: Bell, iconColor: 'text-blue-400' },
}

const defaultConfig = { border: 'border-l-white/20', icon: Bell, iconColor: 'text-white/40' }

export default function NotificationsPage() {
  const { data: notifications, loading, error, refetch } = useNotifications()
  const { markRead } = useMarkReadNotification()
  const { markAllRead } = useMarkAllReadNotifications()

  const unreadCount = notifications.filter((n) => !n.read).length

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-3">
      <h1 className="text-white text-2xl font-bold">Thông báo</h1>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="glass rounded-2xl p-4 animate-pulse flex gap-3">
          <div className="bg-white/8 w-8 h-8 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="bg-white/8 h-3 w-2/3 rounded" />
            <div className="bg-white/8 h-3 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  )

  if (error) return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-white text-2xl font-bold mb-6">Thông báo</h1>
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-white/60 text-sm mb-4">{error}</p>
        <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-white text-2xl font-bold">Thông báo</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-indigo-400 text-sm hover:text-indigo-300 transition-colors">
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="Không có thông báo nào" description="Bạn sẽ nhận được thông báo khi có cập nhật mới" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n: Notification) => {
            const cfg = typeConfig[n.type] ?? defaultConfig
            const Icon = cfg.icon
            return (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={cn(
                  'w-full text-left glass rounded-2xl p-4 border-l-4 transition-all hover:bg-white/8',
                  cfg.border,
                  n.read ? 'opacity-60' : ''
                )}
              >
                <div className="flex items-start gap-3">
                  <Icon size={18} className={cn('mt-0.5 flex-shrink-0', cfg.iconColor)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{n.title}</p>
                    <p className="text-white/60 text-sm mt-0.5">{n.message}</p>
                    <p className="text-white/30 text-xs mt-1">{formatTimeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0 mt-2" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
