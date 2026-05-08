'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity, ArrowLeft, Gauge, MousePointerClick, ShoppingCart, Timer, Users } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useAdminCampaigns } from '@/hooks/queries/useAdminCampaigns'
import { useCampaignMonitorOverview } from '@/hooks/queries/useCampaignMonitorOverview'
import { useCampaignMonitorTimeline } from '@/hooks/queries/useCampaignMonitorTimeline'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'

const WINDOW_OPTIONS = [
  { label: '30 phút', value: 30 },
  { label: '1 giờ', value: 60 },
  { label: '3 giờ', value: 180 },
  { label: '6 giờ', value: 360 },
  { label: '24 giờ', value: 1440 },
  { label: '7 ngày', value: 10080 },
  { label: '30 ngày', value: 43200 },
]

function KpiCard({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string
  value: string
  hint: string
  icon: typeof Activity
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-xs uppercase">{label}</p>
        <Icon className="text-indigo-300/70" size={16} />
      </div>
      <p className="text-white text-2xl font-bold mt-2">{value}</p>
      <p className="text-white/40 text-xs mt-1">{hint}</p>
    </div>
  )
}

export default function AdminCampaignMonitorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [campaignId, setCampaignId] = useState<string>(() => searchParams.get('campaignId') ?? '')
  const [minutes, setMinutes] = useState<number>(10080)

  const { data: campaigns } = useAdminCampaigns(undefined, true)

  const params = useMemo(
    () => ({
      campaignId: campaignId || undefined,
      minutes,
      bucketMinutes: 5
    }),
    [campaignId, minutes]
  )

  const overviewQuery = useCampaignMonitorOverview({
    campaignId: params.campaignId,
    minutes: params.minutes
  })
  const timelineQuery = useCampaignMonitorTimeline(params)

  const loading = overviewQuery.loading || timelineQuery.loading
  const error = overviewQuery.error || timelineQuery.error

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/admin/campaigns')
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button
          onClick={handleBack}
          className="p-2 rounded-xl glass text-white/80 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Quay lại"
          title="Quay lại"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Link href="/admin/campaigns" className="btn-glass text-sm px-3 py-1.5">Danh sách chiến dịch</Link>
        {campaignId && (
          <Link href={`/admin/campaigns/${campaignId}`} className="btn-glass text-sm px-3 py-1.5">Chi tiết chiến dịch</Link>
        )}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-bold">Giám sát chiến dịch</h1>
          <p className="text-white/50 text-sm">
            Theo dõi hành vi người dùng, tốc độ xử lý và biên độ dao động hệ thống theo chiến dịch.
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={campaignId || 'all'}
            onValueChange={(value) => setCampaignId(value && value !== 'all' ? value : '')}
          >
            <SelectTrigger className="input-glass text-sm min-w-[280px] h-10 text-white border-white/10">
              <span className="truncate">
                {campaignId
                  ? (campaigns.find(c => c.id === campaignId)?.name ?? campaignId)
                  : 'Tất cả chiến dịch'}
              </span>
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10 text-white">
              <SelectItem value="all">Tất cả chiến dịch</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(minutes)} onValueChange={(value) => setMinutes(Number(value ?? 60))}>
            <SelectTrigger className="input-glass text-sm w-[140px] h-10 text-white border-white/10">
              <span>{WINDOW_OPTIONS.find(o => o.value === minutes)?.label ?? `${minutes} phút`}</span>
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10 text-white">
              {WINDOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <div className="glass rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {loading || !overviewQuery.data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Lượt truy cập" value={overviewQuery.data.visits.toLocaleString()} hint="Tổng số bản ghi tương tác" icon={MousePointerClick} />
          <KpiCard label="Người dùng duy nhất" value={overviewQuery.data.uniqueVisitors.toLocaleString()} hint="Theo userId hoặc IP" icon={Users} />
          <KpiCard label="Giữ chỗ" value={overviewQuery.data.reservations.toLocaleString()} hint="Số lượt giữ chỗ mới" icon={ShoppingCart} />
          <KpiCard label="Thanh toán thành công" value={overviewQuery.data.successfulPayments.toLocaleString()} hint="Số thanh toán ở trạng thái thành công" icon={Gauge} />
          <KpiCard label="Tỷ lệ giữ chỗ→thanh toán" value={`${overviewQuery.data.reservationToPaymentRatePct.toFixed(2)}%`} hint="Hiệu quả phễu chuyển đổi" icon={Activity} />
          <KpiCard label="Độ trễ thanh toán TB" value={`${overviewQuery.data.avgCheckoutLatencySeconds.toFixed(2)}s`} hint="Từ lúc tạo thanh toán đến khi trả tiền thành công" icon={Timer} />
          <KpiCard label="Đỉnh hành động/giây" value={overviewQuery.data.peakActionsPerSecond.toFixed(2)} hint="Mức tải cao nhất theo giây" icon={Gauge} />
          <KpiCard label="Chỉ số dao động" value={overviewQuery.data.volatilityIndex.toFixed(2)} hint="Độ lệch chuẩn lưu lượng theo phút" icon={Activity} />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-4">
          <h2 className="text-white font-semibold mb-3">Dòng thời gian truy cập và giữ chỗ</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineQuery.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="bucket" tickFormatter={(v) => formatDate(v)} stroke="rgba(255,255,255,0.4)" />
                <YAxis stroke="rgba(255,255,255,0.4)" />
                <Tooltip
                  formatter={(value, name) => [Number(value).toLocaleString(), metricLabelMap[String(name)] ?? String(name)]}
                  labelFormatter={(label) => formatDate(String(label))}
                  contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <Area type="monotone" dataKey="visits" stroke="#60a5fa" fill="#60a5fa33" />
                <Area type="monotone" dataKey="reservations" stroke="#34d399" fill="#34d39933" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <h2 className="text-white font-semibold mb-3">Dòng thời gian chuyển đổi thanh toán</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineQuery.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="bucket" tickFormatter={(v) => formatDate(v)} stroke="rgba(255,255,255,0.4)" />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.4)" />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.4)" />
                <Tooltip
                  formatter={(value, name) => [Number(value).toLocaleString(), metricLabelMap[String(name)] ?? String(name)]}
                  labelFormatter={(label) => formatDate(String(label))}
                  contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <Bar yAxisId="left" dataKey="successfulPayments" fill="#a78bfa" />
                <Bar yAxisId="right" dataKey="successRatePct" fill="#fbbf24" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
  const metricLabelMap: Record<string, string> = {
    visits: 'Lượt truy cập',
    reservations: 'Giữ chỗ',
    successfulPayments: 'Thanh toán thành công',
    successRatePct: 'Tỷ lệ thành công (%)'
  }
