'use client'

import { useMyOrders } from '@/hooks/queries/useMyOrders'
import { useAuthStore } from '@/stores/auth.store'
import { LayoutGrid, ShoppingBag, User, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { GlassCard } from '@/components/shared/GlassCard'

export default function CustomerDashboardPage() {
  const { user } = useAuthStore()
  const { data: orders, loading, error } = useMyOrders()

  const totalOrders = orders?.length ?? 0
  const confirmedOrders = orders?.filter(o => o.status === 'CONFIRMED' || o.status === 'DONE').length ?? 0

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tổng quan</h1>
        <p className="text-white/50 text-sm mt-1">Xin chào, {user?.fullName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <ShoppingBag size={20} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{loading ? '...' : totalOrders}</p>
              <p className="text-xs text-white/50">Tổng đơn hàng</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <LayoutGrid size={20} className="text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{loading ? '...' : confirmedOrders}</p>
              <p className="text-xs text-white/50">Đơn thành công</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Error state */}
      {error && (
        <div className="glass rounded-2xl p-6 text-center">
          <AlertCircle className="mx-auto mb-2 text-red-400" size={28} />
          <p className="text-white/60 text-sm">{error}</p>
        </div>
      )}

      {/* Recent orders */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Đơn hàng gần đây</h2>
          <Link href="/orders" className="text-xs text-indigo-400 hover:text-indigo-300">
            Xem tất cả →
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : orders?.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-6">Chưa có đơn hàng nào</p>
        ) : (
          <div className="space-y-2">
            {orders?.slice(0, 5).map(order => (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all">
                  <div>
                    <p className="text-sm text-white/80 font-medium">#{order.id.slice(-8).toUpperCase()}</p>
                    <p className="text-xs text-white/40">{new Date(order.createdAt).toLocaleDateString('vi-VN')}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/60">{order.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Profile link */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <User size={20} className="text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Thông tin cá nhân</p>
              <p className="text-xs text-white/50">{user?.email}</p>
            </div>
          </div>
          <Link href="/profile" className="text-xs text-indigo-400 hover:text-indigo-300">
            Chỉnh sửa →
          </Link>
        </div>
      </GlassCard>
    </div>
  )
}
