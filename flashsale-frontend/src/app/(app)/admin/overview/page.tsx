'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Users, Store, Zap, ShoppingCart, DollarSign, AlertTriangle, X, Bell } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { useAdminMerchants } from '@/hooks/queries/useAdminMerchants'
import { useAdminCampaigns } from '@/hooks/queries/useAdminCampaigns'
import { useSystemHealth } from '@/hooks/queries/useSystemHealth'
import { useDeadLetterJobs } from '@/hooks/queries/useDeadLetterJobs'
import { useAdminStats } from '@/hooks/queries/useAdminStats'
import { useOrdersByHour } from '@/hooks/queries/useOrdersByHour'
import { useRevenueTrend } from '@/hooks/queries/useRevenueTrend'
import { useActivity } from '@/hooks/queries/useActivity'
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatTimeAgo } from '@/lib/utils'

function StatCard({ icon: Icon, label, value, color, href }: {
  icon: typeof Users; label: string; value: string; color: string; href?: string
}) {
  const content = (
    <div className="glass rounded-2xl p-6 space-y-3 hover:border-white/20 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-white/50 text-sm">{label}</span>
        <div className={`p-2 rounded-xl ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

const tooltipStyle = { background: 'rgba(15,10,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }

const TYPE_COLORS: Record<string, string> = {
  ORDER: 'border-l-emerald-500',
  MERCHANT_APPROVED: 'border-l-blue-500',
  CAMPAIGN_ACTIVE: 'border-l-indigo-500',
}

export default function AdminOverviewPage() {
  const [alertDismissed, setAlertDismissed] = useState(false)
  const { data: pendingMerchants } = useAdminMerchants('PENDING')
  const { data: pendingCampaigns } = useAdminCampaigns('PENDING')
  const { data: health } = useSystemHealth()
  const { data: jobs } = useDeadLetterJobs()
  const { data: stats, loading: statsLoading } = useAdminStats()
  const { data: ordersByHour, loading: ordersLoading } = useOrdersByHour()
  const { data: revenueTrend, loading: revenueLoading } = useRevenueTrend()
  const { data: activity, loading: activityLoading } = useActivity()
  const showAlert = !alertDismissed && (pendingMerchants.length > 0 || pendingCampaigns.length > 0)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-white text-2xl font-bold">Tổng quan hệ thống</h1>

      {showAlert && (
        <div className="glass rounded-xl p-4 border border-yellow-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0" />
            <p className="text-yellow-300 text-sm">
              ⚠️ {pendingMerchants.length > 0 && `${pendingMerchants.length} merchant`}
              {pendingMerchants.length > 0 && pendingCampaigns.length > 0 && ' và '}
              {pendingCampaigns.length > 0 && `${pendingCampaigns.length} chiến dịch`}
              {' '}đang chờ phê duyệt
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/merchants" className="btn-glass text-xs px-3 py-1.5">Xem ngay</Link>
            <button onClick={() => setAlertDismissed(true)} className="p-1.5 text-white/30 hover:text-white/60 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard icon={Users} label="Tổng người dùng" value={stats?.totalUsers?.toLocaleString() ?? '—'} color="bg-blue-500/20" />
          <StatCard icon={Store} label="Merchant hoạt động" value={String(stats?.activeMerchants ?? '—')} color="bg-emerald-500/20" />
          <StatCard icon={Zap} label="Chiến dịch đang chạy" value={String(stats?.activeCampaigns ?? '—')} color="bg-indigo-500/20" />
          <StatCard icon={ShoppingCart} label="Đơn hàng hôm nay" value={String(stats?.ordersToday ?? '—')} color="bg-purple-500/20" />
          <StatCard icon={DollarSign} label="Doanh thu hôm nay" value={formatCurrency(stats?.revenueToday ?? 0)} color="bg-emerald-500/20" />
          <StatCard icon={AlertTriangle} label="Job thất bại" value={String(jobs.length ?? '—')} color={jobs.length > 0 ? 'bg-red-500/20' : 'bg-gray-500/20'} href="/admin/dead-letter-queue" />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders by hour */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Đơn hàng theo giờ (24h)</h2>
          {ordersLoading ? (
            <div className="h-48 animate-pulse bg-white/5 rounded-xl" />
          ) : ordersByHour.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-white/30 text-sm">Chưa có dữ liệu thống kê</div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <BarChart data={ordersByHour}>
                <XAxis dataKey="hour" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="orders" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue trend */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Doanh thu 7 ngày</h2>
          {revenueLoading ? (
            <div className="h-48 animate-pulse bg-white/5 rounded-xl" />
          ) : revenueTrend.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-white/30 text-sm">Chưa có dữ liệu thống kê</div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={revenueTrend}>
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [typeof v === 'number' ? formatCurrency(v) : v, 'Doanh thu']} />
                <Area type="monotone" dataKey="revenue" stroke="#818cf8" fill="rgba(99,102,241,0.15)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold">Hoạt động gần đây</h2>
        </div>
        {activityLoading ? (
          <div className="divide-y divide-white/5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-6 py-4 animate-pulse">
                <div className="bg-white/8 h-8 w-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="bg-white/8 h-3 w-2/3 rounded" />
                  <div className="bg-white/8 h-3 w-1/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : activity.length === 0 ? (
          <EmptyState icon={Bell} title="Chưa có hoạt động" description="" />
        ) : (
          <div className="divide-y divide-white/5">
            {activity.map((item, i) => (
              <div key={i} className={`flex items-start gap-3 px-6 py-4 border-l-4 ${TYPE_COLORS[item.type] ?? 'border-l-white/20'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-sm">{item.message}</p>
                  <p className="text-white/30 text-xs mt-0.5">{formatTimeAgo(item.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-white font-semibold">Trạng thái hệ thống</h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['postgres', 'redis', 'rabbitmq', 'api'] as const).map((svc) => {
              const isUp = health?.[svc] === 'UP'
              const labels: Record<string, string> = { postgres: 'PostgreSQL', redis: 'Redis', rabbitmq: 'RabbitMQ', api: 'API Server' }
              return (
                <div key={svc} className="glass rounded-xl p-3 flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isUp ? 'bg-emerald-400' : 'bg-red-400 animate-live'}`} />
                  <div>
                    <p className="text-white text-sm font-medium">{labels[svc]}</p>
                    <p className={`text-xs ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                      {health ? (isUp ? 'Hoạt động' : 'Lỗi') : '—'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pending actions */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-white font-semibold">Cần xử lý</h2>
          </div>
          <div className="divide-y divide-white/5">
            <Link href="/admin/merchants" className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3">
                <Store size={16} className="text-yellow-400" />
                <span className="text-white/70 text-sm">Merchant chờ duyệt</span>
              </div>
              {pendingMerchants.length > 0 ? (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{pendingMerchants.length}</span>
              ) : (
                <span className="text-white/30 text-xs">Không có</span>
              )}
            </Link>
            <Link href="/admin/campaigns" className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3">
                <Zap size={16} className="text-yellow-400" />
                <span className="text-white/70 text-sm">Chiến dịch chờ duyệt</span>
              </div>
              {pendingCampaigns.length > 0 ? (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{pendingCampaigns.length}</span>
              ) : (
                <span className="text-white/30 text-xs">Không có</span>
              )}
            </Link>
            <Link href="/admin/dead-letter-queue" className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3">
                <AlertTriangle size={16} className={jobs.length > 0 ? 'text-red-400' : 'text-white/30'} />
                <span className="text-white/70 text-sm">Job thất bại</span>
              </div>
              {jobs.length > 0 ? (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{jobs.length}</span>
              ) : (
                <span className="text-emerald-400 text-xs">Bình thường</span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
