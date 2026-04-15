'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp, Clock, Loader2, AlertTriangle,
  Package, DollarSign, Users, Zap, Target,
  ChevronDown, ChevronUp, Activity, Search, Megaphone,
} from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { formatDate } from '@/lib/utils'
import type {
  Campaign, CampaignProduct, CampaignOverview, FunnelStep,
  HeatmapHour, StockoutPrediction, CampaignStatus,
} from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
}

function fmtPct(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

const STATUS_CFG: Record<CampaignStatus, { label: string; dot: string; text: string }> = {
  ACTIVE:    { label: 'Đang hoạt động', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  SCHEDULED: { label: 'Sắp diễn ra',    dot: 'bg-blue-400',    text: 'text-blue-400' },
  APPROVED:  { label: 'Đã duyệt',       dot: 'bg-indigo-400',  text: 'text-indigo-400' },
  DRAFT:     { label: 'Nháp',           dot: 'bg-white/30',    text: 'text-white/40' },
  ENDED:     { label: 'Đã kết thúc',    dot: 'bg-white/20',    text: 'text-white/30' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon }: {
  label: string; value: string; sub?: string; icon: React.ReactNode
}) {
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-sm">{label}</p>
        {icon}
      </div>
      <p className="text-white text-xl font-bold">{value}</p>
      {sub && <p className="text-white/30 text-xs">{sub}</p>}
    </div>
  )
}

function TrendBadge({ trend }: { trend: StockoutPrediction['trend'] }) {
  const cfg = {
    STABLE:       { label: 'Ổn định',     cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    DECLINING:    { label: 'Giảm dần',    cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    ACCELERATING: { label: 'Giảm nhanh', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
    SOLD_OUT:     { label: 'Hết hàng',   cls: 'bg-red-700/30 text-red-200 border-red-600/40' },
  }[trend]
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function CampaignRow({ campaign, selected, onSelect }: {
  campaign: Campaign; selected: boolean; onSelect: () => void
}) {
  const s = STATUS_CFG[campaign.status]
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 rounded-xl transition-all border ${
        selected
          ? 'bg-indigo-500/15 border-indigo-500/30'
          : 'glass border-transparent hover:bg-white/5'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{campaign.name}</p>
          <p className="text-white/40 text-xs truncate">
            {campaign.merchant?.businessName} ·{' '}
            {new Date(campaign.startTime).toLocaleDateString('vi-VN')}
            {' — '}
            {new Date(campaign.endTime).toLocaleDateString('vi-VN')}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-xs ${s.text}`}>{s.label}</span>
          <span className="text-white/25 text-xs">{campaign.campaignProducts.length} SP</span>
        </div>
      </div>
    </button>
  )
}

function ProductPill({ cp, selected, onSelect }: {
  cp: CampaignProduct; selected: boolean; onSelect: () => void
}) {
  const name = cp.product?.name ?? `SP-${cp.id.slice(0, 6)}`
  return (
    <button
      onClick={onSelect}
      className={`px-3 py-2 rounded-xl text-sm transition-all border flex items-center gap-2 ${
        selected
          ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
          : 'border-white/10 glass text-white/60 hover:text-white hover:bg-white/5'
      }`}
    >
      <Package size={12} className="flex-shrink-0" />
      <span className="truncate max-w-40">{name}</span>
      <span className="text-xs opacity-50 flex-shrink-0">
        {cp.remainingQuantity}/{cp.saleQuantity}
      </span>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  const [overview, setOverview] = useState<CampaignOverview | null>(null)
  const [funnel, setFunnel] = useState<FunnelStep[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapHour[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  const [selectedProduct, setSelectedProduct] = useState<CampaignProduct | null>(null)
  const [prediction, setPrediction] = useState<StockoutPrediction | null>(null)
  const [predLoading, setPredLoading] = useState(false)
  const [predError, setPredError] = useState<string | null>(null)

  const [showFunnel, setShowFunnel] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(true)

  // Load campaigns on mount
  useEffect(() => {
    adminService.getCampaigns()
      .then(setCampaigns)
      .catch(() => setCampaigns([]))
      .finally(() => setCampaignsLoading(false))
  }, [])

  // Auto-fetch analytics when campaign changes
  useEffect(() => {
    if (!selectedCampaign) return
    // Đưa setState vào callback async để tránh render lặp
    const run = async () => {
      setAnalyticsLoading(true)
      setAnalyticsError(null)
      setOverview(null)
      setFunnel([])
      // ...existing logic...
    }
    run()
    setTimeout(() => {
      setHeatmap([])
      setSelectedProduct(null)
      setPrediction(null)
    }, 0)

    Promise.all([
      adminService.getCampaignAnalyticsOverview(selectedCampaign.id),
      adminService.getCampaignFunnel(selectedCampaign.id),
      adminService.getCampaignHeatmap(selectedCampaign.id),
    ])
      .then(([ov, fn, hm]) => {
        setOverview(ov)
        setFunnel(fn ?? [])
        setHeatmap(hm ?? [])
      })
      .catch(err => setAnalyticsError(err instanceof Error ? err.message : 'Không thể tải analytics.'))
      .finally(() => setAnalyticsLoading(false))
  }, [selectedCampaign])

  // Auto-fetch prediction when product changes
  useEffect(() => {
    if (!selectedCampaign || !selectedProduct) return
    const run = async () => {
      setPredLoading(true)
      setPredError(null)
      setPrediction(null)
      // ...existing logic...
    }
    run()

    adminService.predictStockout(selectedCampaign.id, selectedProduct.id)
      .then(setPrediction)
      .catch(err => setPredError(err instanceof Error ? err.message : 'Không thể dự đoán.'))
      .finally(() => setPredLoading(false))
  }, [selectedCampaign, selectedProduct])

  const filtered = campaigns.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.merchant?.businessName ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const maxHeat = heatmap.reduce((m, h) => Math.max(m, h.count), 1)
  const maxFunnel = funnel[0]?.count ?? 1

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/20">
          <TrendingUp size={24} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold">Phân tích & Dự đoán</h1>
          <p className="text-white/50 text-sm mt-1">
            Funnel chuyển đổi, heatmap thanh toán và dự đoán stockout bằng linear regression
          </p>
        </div>
      </div>

      {/* Campaign selector */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-4">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            <Megaphone size={15} className="text-indigo-400" />
            Chọn Campaign
            {selectedCampaign && (
              <span className="text-indigo-300 font-normal">— {selectedCampaign.name}</span>
            )}
          </h2>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm kiếm..."
              className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-white text-sm placeholder:text-white/20 outline-none focus:border-indigo-500/50 w-52"
            />
          </div>
        </div>
        <div className="p-3 space-y-1 max-h-60 overflow-y-auto">
          {campaignsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={22} className="animate-spin text-indigo-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-8">Không tìm thấy campaign</p>
          ) : filtered.map(c => (
            <CampaignRow
              key={c.id}
              campaign={c}
              selected={selectedCampaign?.id === c.id}
              onSelect={() => setSelectedCampaign(prev => prev?.id === c.id ? null : c)}
            />
          ))}
        </div>
      </div>

      {/* Analytics loading / error */}
      {analyticsLoading && (
        <div className="glass rounded-2xl p-12 flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-indigo-400" />
          <p className="text-white/50 text-sm">Đang tải analytics...</p>
        </div>
      )}
      {analyticsError && (
        <div className="flex items-center gap-3 glass rounded-2xl px-5 py-4 border border-red-500/20">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{analyticsError}</p>
        </div>
      )}

      {/* Overview */}
      {overview && !analyticsLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Tồn kho còn"
              value={`${overview.stockRemaining.toLocaleString()} (${fmtPct(overview.stockRatio)})`}
              icon={<Package size={18} className="text-blue-400" />}
            />
            <StatCard
              label="Đã bán"
              value={overview.totalSold.toLocaleString()}
              icon={<Zap size={18} className="text-yellow-400" />}
            />
            <StatCard
              label="Doanh thu"
              value={fmtCurrency(overview.totalRevenue)}
              icon={<DollarSign size={18} className="text-emerald-400" />}
            />
            <StatCard
              label="Tỉ lệ chuyển đổi"
              value={fmtPct(overview.conversionRate)}
              sub={`Velocity: ${overview.revenueVelocity.toLocaleString()} VND/phút`}
              icon={<Users size={18} className="text-indigo-400" />}
            />
          </div>
          <p className="text-white/30 text-xs text-right">
            <Clock size={10} className="inline mr-1" />
            Snapshot tại {formatDate(overview.snapshotAt)}
          </p>
        </div>
      )}

      {/* Funnel */}
      {funnel.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowFunnel(s => !s)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-white/8 hover:bg-white/3 transition-colors"
          >
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Target size={16} className="text-violet-400" />
              Funnel Chuyển đổi
            </h2>
            {showFunnel ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
          </button>
          {showFunnel && (
            <div className="p-5 space-y-3">
              {funnel.map((step, idx) => {
                const pct = Math.round((step.count / maxFunnel) * 100)
                return (
                  <div key={step.step} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-white/70">
                        <span className="text-white/30 text-xs w-4">{idx + 1}</span>
                        <span>{step.step}</span>
                        {step.dropoffRate > 0.3 && (
                          <span className="text-red-400 text-xs">(dropoff cao!)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-white/50">
                        <span>{step.count.toLocaleString()} người</span>
                        <span className="text-indigo-300">{fmtPct(step.conversionRate)} CR</span>
                        {step.dropoffRate > 0 && (
                          <span className="text-red-400">-{fmtPct(step.dropoffRate)}</span>
                        )}
                      </div>
                    </div>
                    <div className="h-6 bg-white/5 rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                          opacity: 1 - idx * 0.15,
                        }}
                      />
                      <span className="absolute inset-y-0 left-3 flex items-center text-white/60 text-xs">
                        {pct}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Heatmap */}
      {heatmap.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowHeatmap(s => !s)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-white/8 hover:bg-white/3 transition-colors"
          >
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Activity size={16} className="text-orange-400" />
              Heatmap Thanh toán theo Giờ
            </h2>
            {showHeatmap ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
          </button>
          {showHeatmap && (
            <div className="p-5">
              <div className="flex items-end gap-1 h-28">
                {Array.from({ length: 24 }).map((_, hour) => {
                  const entry = heatmap.find(h => h.hour === hour)
                  const count = entry?.count ?? 0
                  const heightPct = maxHeat > 0 ? (count / maxHeat) * 100 : 0
                  const isPeak = count === maxHeat && count > 0
                  return (
                    <div key={hour} className="flex-1 flex flex-col items-center group relative">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                        {hour}:00 — {count.toLocaleString()}
                      </div>
                      <div
                        className={`w-full rounded-t transition-all duration-500 ${
                          isPeak ? 'bg-orange-500'
                            : count > maxHeat * 0.6 ? 'bg-indigo-500/80'
                            : 'bg-indigo-500/30'
                        }`}
                        style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="w-full flex justify-between text-white/30 text-xs mt-2">
                <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
              </div>
              <p className="text-white/30 text-xs mt-1 text-center">
                Peak: {heatmap.reduce((m, h) => h.count > m.count ? h : m, { hour: 0, count: 0 }).hour}:00
                — {maxHeat.toLocaleString()} thanh toán
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stockout Prediction */}
      {selectedCampaign && !analyticsLoading && selectedCampaign.campaignProducts.length > 0 && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Zap size={16} className="text-yellow-400" />
              Dự đoán Hết hàng (Linear Regression)
            </h2>
            <p className="text-white/40 text-xs mt-1">Chọn sản phẩm để xem dự đoán tự động</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedCampaign.campaignProducts.map(cp => (
              <ProductPill
                key={cp.id}
                cp={cp}
                selected={selectedProduct?.id === cp.id}
                onSelect={() => setSelectedProduct(prev => prev?.id === cp.id ? null : cp)}
              />
            ))}
          </div>

          {predLoading && (
            <div className="flex items-center gap-3 py-2">
              <Loader2 size={16} className="animate-spin text-yellow-400" />
              <p className="text-white/50 text-sm">Đang tính toán...</p>
            </div>
          )}

          {predError && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-red-300 text-sm">{predError}</p>
            </div>
          )}

          {prediction && (
            <div className="glass rounded-xl p-5 border border-yellow-500/20 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-medium">Kết quả dự đoán</h3>
                <TrendBadge trend={prediction.trend} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Tồn kho hiện tại</p>
                  <p className="text-white font-bold text-lg">{prediction.stockRemaining}</p>
                </div>
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Dự đoán hết hàng</p>
                  <p className="text-white font-bold text-sm">
                    {prediction.stockoutAt ? formatDate(prediction.stockoutAt) : 'Không xác định'}
                  </p>
                </div>
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Độ tin cậy (R²)</p>
                  <p className={`font-bold text-lg ${
                    prediction.confidence > 0.8 ? 'text-emerald-400'
                      : prediction.confidence > 0.5 ? 'text-yellow-400'
                      : 'text-red-400'
                  }`}>
                    {(prediction.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Số data points</p>
                  <p className="text-white font-bold text-lg">{prediction.dataPoints}</p>
                </div>
              </div>
              {prediction.stockoutAt && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                  <p className="text-red-300 text-sm">
                    Dự đoán hết hàng vào <strong>{formatDate(prediction.stockoutAt)}</strong>.
                    Cân nhắc bổ sung tồn kho hoặc điều chỉnh chiến lược giá.
                  </p>
                </div>
              )}
              <p className="text-white/30 text-xs text-right">
                Tính lúc {formatDate(prediction.computedAt)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
