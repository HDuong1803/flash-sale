'use client'

import { useState } from 'react'
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, BarChart2, AlertCircle, Package, Calendar
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts'
import { useMerchantRevenue } from '@/hooks/queries/useMerchantRevenue'
import { StatCardSkeleton } from '@/components/shared/skeletons/StatCardSkeleton'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatChartMoney } from '@/lib/utils'
import type { RevenueDateRange, MerchantRevenueSummary } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0]
}

function daysAgo(n: number): string {
  return toDateStr(new Date(Date.now() - n * 24 * 60 * 60 * 1000))
}

function today(): string {
  return toDateStr(new Date())
}

const PRESETS: { label: string; start: () => string }[] = [
  { label: '7 ngày', start: () => daysAgo(7) },
  { label: '30 ngày', start: () => daysAgo(30) },
  { label: '90 ngày', start: () => daysAgo(90) },
  { label: 'Tháng này', start: () => toDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) },
  { label: 'Năm nay', start: () => `${new Date().getFullYear()}-01-01` },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function GrowthBadge({ rate }: { rate: number }) {
  if (rate === 0) return <span className="text-white/40 text-sm">Không đổi</span>
  const isUp = rate > 0
  const Icon = isUp ? TrendingUp : TrendingDown
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
      <Icon size={14} />
      {isUp ? '+' : ''}{rate}% so kỳ trước
    </span>
  )
}

function SummaryCards({ summary }: { summary: MerchantRevenueSummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={DollarSign} label="Tổng doanh thu"
        value={formatCurrency(summary.totalRevenue)}
        sub="Toàn thời gian"
        color="bg-emerald-500/20"
      />
      <div className="glass rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/50 text-sm">Doanh thu kỳ này</span>
          <div className="p-2 rounded-xl bg-indigo-500/20">
            <TrendingUp size={18} className="text-white" />
          </div>
        </div>
        <p className="text-white text-2xl font-bold">{formatCurrency(summary.revenueThisPeriod)}</p>
        <GrowthBadge rate={summary.growthRate} />
      </div>
      <StatCard
        icon={ShoppingCart} label="Đơn hoàn thành"
        value={`${summary.successOrders} / ${summary.totalOrders}`}
        sub={`${summary.cancelledOrders} đơn đã huỷ`}
        color="bg-violet-500/20"
      />
      <StatCard
        icon={BarChart2} label="Giá trị TB / đơn"
        value={formatCurrency(summary.avgOrderValue)}
        sub="Đơn hoàn thành"
        color="bg-blue-500/20"
      />
    </div>
  )
}

// ─── Date range picker ────────────────────────────────────────────────────────

function DateRangePicker({
  range, onChange,
}: {
  range: RevenueDateRange
  onChange: (r: RevenueDateRange) => void
}) {
  const [draft, setDraft] = useState(range)

  const applyPreset = (start: string) => {
    const r = { startDate: start, endDate: today() }
    setDraft(r)
    onChange(r)
  }

  const handleApply = () => {
    if (draft.startDate && draft.endDate && draft.startDate <= draft.endDate) {
      onChange(draft)
    }
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.start())}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              range.startDate === p.start() && range.endDate === today()
                ? 'bg-indigo-500/30 text-indigo-300'
                : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {/* Custom inputs */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-white/30" />
        <input
          type="date"
          value={draft.startDate}
          max={draft.endDate}
          onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))}
          className="glass rounded-lg px-3 py-1.5 text-sm text-white bg-transparent [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
        <span className="text-white/30 text-sm">—</span>
        <input
          type="date"
          value={draft.endDate}
          min={draft.startDate}
          max={today()}
          onChange={e => setDraft(d => ({ ...d, endDate: e.target.value }))}
          className="glass rounded-lg px-3 py-1.5 text-sm text-white bg-transparent [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
        <button
          onClick={handleApply}
          disabled={!draft.startDate || !draft.endDate || draft.startDate > draft.endDate}
          className="px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-all"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
        >
          Áp dụng
        </button>
      </div>
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MerchantRevenuePage() {
  const [range, setRange] = useState<RevenueDateRange>({
    startDate: daysAgo(30),
    endDate: today(),
  })
  const { data, loading, error, refetch } = useMerchantRevenue(range)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-white/5 rounded-xl animate-pulse" />
        <div className="glass rounded-2xl h-24 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="glass rounded-2xl h-64 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass rounded-2xl h-64 animate-pulse" />
          <div className="glass rounded-2xl h-64 animate-pulse" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass rounded-2xl p-8 text-center max-w-md mx-auto mt-12">
        <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
        <p className="text-white/60 text-sm mb-4">{error}</p>
        <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
      </div>
    )
  }

  if (!data) {
    return <EmptyState icon={BarChart2} title="Chưa có dữ liệu" description="Dữ liệu sẽ hiển thị khi có đơn hàng" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-white text-2xl font-bold">Doanh thu</h1>

      {/* Date range picker */}
      <DateRangePicker range={range} onChange={setRange} />

      {/* Summary cards */}
      <SummaryCards summary={data.summary} />

      {/* Revenue trend chart */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Doanh thu theo ngày</h2>
        {data.summary.totalOrders === 0 ? (
          <div className="h-52 flex items-center justify-center text-white/30 text-sm">Chưa có dữ liệu</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.dailyRevenue} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                tickFormatter={v => v.slice(5)}
                axisLine={false} tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                tickFormatter={(v) => formatChartMoney(Number(v))}
                axisLine={false} tickLine={false} width={40}
              />
              <Tooltip
                contentStyle={{ background: 'rgba(15,10,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                formatter={(value, name) => [
                  name === 'revenue' ? formatCurrency(Number(value)) : `${value} đơn`,
                  name === 'revenue' ? 'Doanh thu' : 'Đơn hàng'
                ]}
              />
              <Line
                type="monotone" dataKey="revenue"
                stroke="#818cf8" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* By campaign */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Theo chiến dịch</h2>
        {data.byCampaign.length === 0 ? (
          <p className="text-white/30 text-sm py-8 text-center">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-2">
            {data.byCampaign.map(c => (
              <div key={c.campaignId} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-white text-sm font-medium truncate">{c.campaignName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={c.campaignStatus as never} />
                    <span className="text-white/40 text-xs">{c.orders} đơn</span>
                  </div>
                </div>
                <span className="text-indigo-300 font-semibold text-sm whitespace-nowrap">
                  {formatCurrency(c.revenue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top products */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Top 5 sản phẩm</h2>
        {data.topProducts.length === 0 ? (
          <EmptyState icon={Package} title="Chưa có dữ liệu" description="Sản phẩm sẽ xuất hiện khi có đơn hàng" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs border-b border-white/5">
                  <th className="text-left pb-3 font-medium">#</th>
                  <th className="text-left pb-3 font-medium">Sản phẩm</th>
                  <th className="text-right pb-3 font-medium">Số lượng bán</th>
                  <th className="text-right pb-3 font-medium">Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p, idx) => (
                  <tr key={p.productId} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                    <td className="py-3 pr-3 text-white/30 font-bold">{idx + 1}</td>
                    <td className="py-3 text-white">{p.productName}</td>
                    <td className="py-3 text-right text-white/60">{p.quantity}</td>
                    <td className="py-3 text-right text-indigo-300 font-semibold">{formatCurrency(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
