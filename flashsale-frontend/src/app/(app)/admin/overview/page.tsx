'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Users, Store, Zap, ShoppingCart, DollarSign, AlertTriangle, X, Bell, ChevronDown, Calendar } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { useAdminMerchants } from '@/hooks/queries/useAdminMerchants'
import type { CampaignStatus } from '@/types'
import { useAdminCampaigns } from '@/hooks/queries/useAdminCampaigns'
import { useSystemHealth } from '@/hooks/queries/useSystemHealth'
import { useDeadLetterJobs } from '@/hooks/queries/useDeadLetterJobs'
import { useAdminStats } from '@/hooks/queries/useAdminStats'
import { useOrdersByTime } from '@/hooks/queries/useOrdersByHour'
import { useRevenueTrend } from '@/hooks/queries/useRevenueTrend'
import { useActivity } from '@/hooks/queries/useActivity'
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatTimeAgo } from '@/lib/utils'
import { useAdminStream } from '@/hooks/useAdminStream'

// ─── Time range helpers ────────────────────────────────────────────────────────

type TimePreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

const PRESET_LABELS: Record<TimePreset, string> = {
  today:   'Hôm nay',
  week:    'Tuần này',
  month:   'Tháng này',
  quarter: 'Quý này',
  year:    'Năm nay',
  custom:  'Tùy chọn...',
}

function getPresetRange(preset: Exclude<TimePreset, 'custom'>): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'week': {
      const day = start.getDay()
      const diffToMon = (day === 0 ? -6 : 1 - day)
      start.setDate(start.getDate() + diffToMon)
      start.setHours(0, 0, 0, 0)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      break
    }
    case 'month':
      start.setDate(1); start.setHours(0, 0, 0, 0)
      end.setMonth(end.getMonth() + 1, 0); end.setHours(23, 59, 59, 999)
      break
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      start.setMonth(q * 3, 1); start.setHours(0, 0, 0, 0)
      end.setMonth(q * 3 + 3, 0); end.setHours(23, 59, 59, 999)
      break
    }
    case 'year':
      start.setMonth(0, 1); start.setHours(0, 0, 0, 0)
      end.setMonth(11, 31); end.setHours(23, 59, 59, 999)
      break
  }
  return { start, end }
}

// ─── TimeRangePicker component ─────────────────────────────────────────────────

function TimeRangePicker({ onChange }: { onChange: (start: Date, end: Date) => void }) {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<TimePreset>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd]     = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function selectPreset(p: TimePreset) {
    setPreset(p)
    if (p !== 'custom') {
      const { start, end } = getPresetRange(p as Exclude<TimePreset, 'custom'>)
      onChange(start, end)
      setOpen(false)
    }
  }

  function applyCustom() {
    if (!customStart || !customEnd) return
    const start = new Date(customStart + 'T00:00:00')
    const end   = new Date(customEnd   + 'T23:59:59.999')
    if (start > end) return
    onChange(start, end)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90 glass px-3 py-1.5 rounded-lg border border-white/10 transition-colors"
      >
        <Calendar size={13} />
        {PRESET_LABELS[preset]}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-20 w-56 glass rounded-xl border border-white/10 overflow-hidden shadow-xl">
          {(Object.entries(PRESET_LABELS) as [TimePreset, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => selectPreset(key)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                preset === key
                  ? 'bg-indigo-600/40 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="px-4 py-3 space-y-2 border-t border-white/10">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white [color-scheme:dark]"
              />
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white [color-scheme:dark]"
              />
              <button
                onClick={applyCustom}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg py-1.5 transition-colors"
              >
                Áp dụng
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


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
  const { connected: streamConnected } = useAdminStream()
  const [alertDismissed, setAlertDismissed] = useState(false)
  const { data: pendingMerchants } = useAdminMerchants('PENDING')
  const { data: pendingCampaigns } = useAdminCampaigns('DRAFT' as CampaignStatus)
  const { data: health } = useSystemHealth()
  const { data: jobs } = useDeadLetterJobs()
  const { data: stats, loading: statsLoading } = useAdminStats()
  const [ordersRange, setOrdersRange] = useState<{ start: Date; end: Date }>(
    () => getPresetRange('today')
  )
  const { data: ordersByHour, loading: ordersLoading } = useOrdersByTime(ordersRange.start, ordersRange.end)
  const { data: revenueTrend, loading: revenueLoading } = useRevenueTrend()
  const { data: activity, loading: activityLoading } = useActivity()
  const showAlert = !alertDismissed && (pendingMerchants.length > 0 || pendingCampaigns.length > 0)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-white text-2xl font-bold">Tổng quan hệ thống</h1>
        <div className="flex items-center gap-1.5 text-xs">
          <span className={`w-2 h-2 rounded-full ${streamConnected ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
          <span className={streamConnected ? 'text-emerald-400' : 'text-white/30'}>
            {streamConnected ? 'Trực tiếp' : 'Đang kết nối...'}
          </span>
        </div>
      </div>

      {showAlert && (
        <div className="glass rounded-xl p-4 border border-yellow-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0" />
            <p className="text-yellow-300 text-sm">
              ⚠️ {pendingMerchants.length > 0 && `${pendingMerchants.length} nhà bán hàng`}
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
          <StatCard icon={Store} label="Nhà bán hàng hoạt động" value={String(stats?.activeMerchants ?? '—')} color="bg-emerald-500/20" />
          <StatCard icon={Zap} label="Chiến dịch đang chạy" value={String(stats?.liveCampaigns ?? '—')} color="bg-indigo-500/20" />
          <StatCard icon={ShoppingCart} label="Đơn hàng hôm nay" value={String(stats?.ordersToday ?? '—')} color="bg-purple-500/20" />
          <StatCard icon={DollarSign} label="Doanh thu hôm nay" value={formatCurrency(stats?.revenueToday ?? 0)} color="bg-emerald-500/20" />
          <StatCard icon={AlertTriangle} label="Công việc thất bại" value={String(jobs.length ?? '—')} color={jobs.length > 0 ? 'bg-red-500/20' : 'bg-gray-500/20'} href="/admin/dead-letter-queue" />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders by time */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Biểu đồ đơn hàng</h2>
            <TimeRangePicker onChange={(start, end) => setOrdersRange({ start, end })} />
          </div>
          {ordersLoading ? (
            <div className="h-48 animate-pulse bg-white/5 rounded-xl" />
          ) : ordersByHour.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-white/30 text-sm">Chưa có dữ liệu thống kê</div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <BarChart data={ordersByHour}>
                <XAxis dataKey="bucket" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
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
              const labels: Record<string, string> = { postgres: 'PostgreSQL', redis: 'Redis', rabbitmq: 'RabbitMQ', api: 'Máy chủ API' }
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
                <span className="text-white/70 text-sm">Nhà bán hàng chờ duyệt</span>
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
