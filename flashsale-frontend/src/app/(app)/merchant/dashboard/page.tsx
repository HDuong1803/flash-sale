'use client'

import Link from 'next/link'
import { DollarSign, Zap, ShoppingCart, TrendingUp, AlertCircle, Plus } from 'lucide-react'
import { useMerchantStats } from '@/hooks/queries/useMerchantStats'
import { useCampaigns } from '@/hooks/queries/useCampaigns'
import { useMerchantOrders } from '@/hooks/queries/useMerchantOrders'
import { useAuthStore } from '@/stores/auth.store'
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { StockProgressBar } from '@/components/shared/StockProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatTimeAgo, maskString } from '@/lib/utils'
import type { MerchantStats } from '@/types'

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: typeof DollarSign; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="glass rounded-2xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-white/50 text-sm">{label}</span>
        <div className={`p-2 rounded-xl ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-white/40 text-xs">{sub}</p>}
    </div>
  )
}

export default function MerchantDashboardPage() {
  const { user } = useAuthStore()
  const { data: stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useMerchantStats()
  const { data: campaigns, loading: campaignLoading } = useCampaigns()
  const { data: orders, loading: ordersLoading } = useMerchantOrders()

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-bold">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">Xin chào, {user?.fullName}</p>
        </div>
        <Link href="/merchant/campaigns/create" className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Tạo chiến dịch
        </Link>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : statsError ? (
        <div className="glass rounded-2xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-red-400" />
            <span className="text-white/60 text-sm">{statsError}</span>
          </div>
          <button onClick={refetchStats} className="btn-glass text-sm px-3 py-1.5">Thử lại</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={DollarSign} label="Doanh thu hôm nay" value={formatCurrency(stats?.revenueToday ?? 0)} sub={stats?.revenueTrend ? `${stats.revenueTrend > 0 ? '+' : ''}${stats.revenueTrend}% so với hôm qua` : undefined} color="bg-emerald-500/20" />
          <StatCard icon={Zap} label="Chiến dịch đang chạy" value={String(stats?.activeCampaigns ?? '—')} sub={stats?.campaignEndingSoon ? `${stats.campaignEndingSoon} sắp kết thúc` : undefined} color="bg-indigo-500/20" />
          <StatCard icon={ShoppingCart} label="Đơn hàng hôm nay" value={String(stats?.ordersToday ?? '—')} sub={stats?.ordersTrend ? `${stats.ordersTrend > 0 ? '+' : ''}${stats.ordersTrend}% so với hôm qua` : undefined} color="bg-blue-500/20" />
          <StatCard icon={TrendingUp} label="Tỷ lệ chuyển đổi" value={stats?.conversionRate ? `${stats.conversionRate}%` : '—'} color="bg-purple-500/20" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign mini table */}
        <div className="lg:col-span-2 glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <h2 className="text-white font-semibold">Chiến dịch gần đây</h2>
            <Link href="/merchant/campaigns" className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors">Xem tất cả →</Link>
          </div>
          {campaignLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass rounded-xl p-3 animate-pulse flex gap-3">
                  <div className="bg-white/8 h-4 flex-1 rounded" />
                  <div className="bg-white/8 h-4 w-20 rounded" />
                </div>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={Zap} title="Chưa có chiến dịch nào" description="" action={{ label: 'Tạo chiến dịch', onClick: () => {} }} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    {['Tên', 'Trạng thái', 'Tồn kho', 'Hành động'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 5).map((c) => {
                    const totalStock = c.campaignProducts?.reduce((s, p) => s + p.saleQuantity, 0)
                    const remaining = c.campaignProducts?.reduce((s, p) => s + p.remainingQuantity, 0)
                    return (
                      <tr key={c.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-white text-sm font-medium line-clamp-1">{c.name}</p>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-3 w-32">
                          <StockProgressBar remaining={remaining} total={totalStock} size="sm" />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/merchant/campaigns/${c.id}/dashboard`} className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors">Dashboard</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <h2 className="text-white font-semibold">Đơn hàng gần đây</h2>
            <Link href="/merchant/orders" className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors">Xem tất cả →</Link>
          </div>
          <div className="divide-y divide-white/5">
            {ordersLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse flex gap-3 items-center">
                    <div className="bg-white/8 h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="bg-white/8 h-3 w-3/4 rounded" />
                      <div className="bg-white/8 h-3 w-1/2 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-8">Chưa có đơn hàng</p>
            ) : (
              orders.slice(0, 5).map((order) => (
                <div key={order.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.3), rgba(124,58,237,0.3))' }}>
                    {order.customerId.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/70 text-xs font-medium">{maskString(order.items[0]?.productName ?? 'Sản phẩm')}</p>
                    <p className="text-white/40 text-xs">{formatTimeAgo(order.createdAt)}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-indigo-300 text-xs font-bold">{formatCurrency(order.totalAmount)}</p>
                    <StatusBadge status={order.status} className="scale-75 origin-right" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
