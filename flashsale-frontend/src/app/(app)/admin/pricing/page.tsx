'use client'

import { useState, useEffect } from 'react'
import {
  Tag, Loader2, AlertTriangle, RefreshCw,
  TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Zap, Clock, Package, Search, Megaphone,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { formatDate } from '@/lib/utils'
import type { Campaign, CampaignProduct, PricingRule, PriceHistoryEntry, CampaignStatus } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
}

const STATUS_CFG: Record<CampaignStatus, { label: string; dot: string; text: string }> = {
  ACTIVE:    { label: 'Đang hoạt động', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  SCHEDULED: { label: 'Sắp diễn ra',    dot: 'bg-blue-400',    text: 'text-blue-400' },
  APPROVED:  { label: 'Đã duyệt',       dot: 'bg-indigo-400',  text: 'text-indigo-400' },
  DRAFT:     { label: 'Nháp',           dot: 'bg-white/30',    text: 'text-white/40' },
  ENDED:     { label: 'Đã kết thúc',    dot: 'bg-white/20',    text: 'text-white/30' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
          : 'border-white/10 glass text-white/60 hover:text-white hover:bg-white/5'
      }`}
    >
      <Package size={12} className="flex-shrink-0" />
      <span className="truncate max-w-40">{name}</span>
      <span className="text-xs opacity-50 flex-shrink-0">
        {fmtCurrency(cp.salePrice)}
      </span>
    </button>
  )
}

function StrategyBadge({ strategy }: { strategy: PricingRule['strategy'] }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    STOCK_BASED:    { label: 'Theo tồn kho',    cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    VELOCITY_BASED: { label: 'Theo tốc độ bán', cls: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
    TIME_BASED:     { label: 'Theo thời gian',  cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    COMPOSITE:      { label: 'Kết hợp',         cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  }
  const { label, cls } = cfg[strategy] ?? { label: strategy, cls: '' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  )
}

function RuleConditionText({ rule }: { rule: PricingRule }) {
  const parts: string[] = []
  if (rule.stockRatioLow != null)
    parts.push(`Tồn kho ${(rule.stockRatioLow * 100).toFixed(0)}%–${((rule.stockRatioHigh ?? 1) * 100).toFixed(0)}%`)
  if (rule.velocityMin != null)
    parts.push(`Tốc độ ${rule.velocityMin}–${rule.velocityMax ?? '∞'} đơn/phút`)
  if (rule.minutesBeforeEnd != null)
    parts.push(`Còn ${rule.minutesBeforeEnd} phút trước khi kết thúc`)
  if (parts.length === 0)
    return <span className="text-white/30 text-xs">Không có điều kiện</span>
  return <span className="text-white/60 text-xs">{parts.join(' · ')}</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPricingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<CampaignProduct | null>(null)

  const [rules, setRules] = useState<PricingRule[]>([])
  const [history, setHistory] = useState<PriceHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(true)
  const [disablingId, setDisablingId] = useState<string | null>(null)

  const [evalLoading, setEvalLoading] = useState(false)
  const [evalResult, setEvalResult] = useState<{
    shouldChange: boolean; oldPrice: number; newPrice: number; reason: string
  } | null>(null)

  // Load campaigns on mount
  useEffect(() => {
    adminService.getCampaigns()
      .then(setCampaigns)
      .catch(() => setCampaigns([]))
      .finally(() => setCampaignsLoading(false))
  }, [])

  // Auto-fetch rules + history when product changes
  useEffect(() => {
    if (!selectedProduct) return
    setLoading(true)
    setError(null)
    setRules([])
    setHistory([])
    setEvalResult(null)

    Promise.all([
      adminService.getPricingRules(selectedProduct.id),
      adminService.getPriceHistory(selectedProduct.id, 50),
    ])
      .then(([r, h]) => { setRules(r); setHistory(h) })
      .catch(err => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu.'))
      .finally(() => setLoading(false))
  }, [selectedProduct])

  const handleEvaluate = async () => {
    if (!selectedProduct) return
    setEvalLoading(true)
    setEvalResult(null)
    try {
      const result = await adminService.triggerPricingEvaluation(selectedProduct.id)
      setEvalResult(result)
      if (result.shouldChange) {
        const h = await adminService.getPriceHistory(selectedProduct.id, 50)
        setHistory(h)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trigger evaluation thất bại.')
    } finally {
      setEvalLoading(false)
    }
  }

  const handleDeactivate = async (ruleId: string) => {
    setDisablingId(ruleId)
    try {
      await adminService.deactivatePricingRule(ruleId)
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive: false } : r))
    } catch {
      // best-effort
    } finally {
      setDisablingId(null)
    }
  }

  const filtered = campaigns.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.merchant?.businessName ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const activeRules = rules.filter(r => r.isActive)
  const inactiveRules = rules.filter(r => !r.isActive)

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/20">
          <Tag size={24} className="text-emerald-400" />
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold">Định giá Động</h1>
          <p className="text-white/50 text-sm mt-1">
            Quản lý pricing rules, xem lịch sử thay đổi giá và trigger evaluation thủ công
          </p>
        </div>
      </div>

      {/* Campaign selector */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-4">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            <Megaphone size={15} className="text-emerald-400" />
            Chọn Campaign
            {selectedCampaign && (
              <span className="text-emerald-300 font-normal">— {selectedCampaign.name}</span>
            )}
          </h2>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm kiếm..."
              className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-white text-sm placeholder:text-white/20 outline-none focus:border-emerald-500/50 w-52"
            />
          </div>
        </div>
        <div className="p-3 space-y-1 max-h-60 overflow-y-auto">
          {campaignsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={22} className="animate-spin text-emerald-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-8">Không tìm thấy campaign</p>
          ) : filtered.map(c => (
            <CampaignRow
              key={c.id}
              campaign={c}
              selected={selectedCampaign?.id === c.id}
              onSelect={() => {
                const next = selectedCampaign?.id === c.id ? null : c
                setSelectedCampaign(next)
                setSelectedProduct(null)
                setRules([])
                setHistory([])
                setEvalResult(null)
                setError(null)
              }}
            />
          ))}
        </div>
      </div>

      {/* Product selector */}
      {selectedCampaign && selectedCampaign.campaignProducts.length > 0 && (
        <div className="glass rounded-2xl p-5 space-y-3">
          <div>
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              <Package size={15} className="text-emerald-400" />
              Chọn Sản phẩm
              {selectedProduct && (
                <span className="text-emerald-300 font-normal">
                  — {selectedProduct.product?.name ?? selectedProduct.id.slice(0, 8)}
                </span>
              )}
            </h2>
            <p className="text-white/30 text-xs mt-1">Chọn sản phẩm để tự động tải pricing rules</p>
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

          {/* Trigger action */}
          {selectedProduct && rules.length > 0 && (
            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={() => { void handleEvaluate() }}
                disabled={evalLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
              >
                {evalLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {evalLoading ? 'Đang tính...' : 'Trigger Evaluation Ngay'}
              </button>
              <span className="text-white/30 text-xs">
                {activeRules.length} active · {inactiveRules.length} inactive
              </span>
            </div>
          )}
        </div>
      )}

      {/* Loading / error */}
      {loading && (
        <div className="glass rounded-2xl p-12 flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-emerald-400" />
          <p className="text-white/50 text-sm">Đang tải pricing rules...</p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 glass rounded-2xl px-5 py-4 border border-red-500/20">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Evaluate result */}
      {evalResult && (
        <div className={`glass rounded-2xl p-5 border space-y-3 ${evalResult.shouldChange ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10'}`}>
          <div className="flex items-center gap-2">
            {evalResult.shouldChange
              ? <CheckCircle2 size={18} className="text-emerald-400" />
              : <RefreshCw size={18} className="text-white/30" />
            }
            <h3 className="text-white font-semibold">
              {evalResult.shouldChange ? 'Giá đã được điều chỉnh!' : 'Không cần điều chỉnh giá'}
            </h3>
          </div>
          {evalResult.shouldChange && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-white/60">{fmtCurrency(evalResult.oldPrice)}</span>
              <TrendingUp size={14} className="text-white/30" />
              <span className="text-emerald-300 font-semibold">{fmtCurrency(evalResult.newPrice)}</span>
              <span className={`text-xs ${evalResult.newPrice > evalResult.oldPrice ? 'text-red-400' : 'text-emerald-400'}`}>
                {evalResult.newPrice > evalResult.oldPrice ? '▲' : '▼'}
                {Math.abs(((evalResult.newPrice - evalResult.oldPrice) / evalResult.oldPrice) * 100).toFixed(1)}%
              </span>
            </div>
          )}
          <p className="text-white/50 text-xs">{evalResult.reason}</p>
        </div>
      )}

      {/* Rules list */}
      {rules.length > 0 && !loading && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Tag size={16} className="text-indigo-400" />
              Pricing Rules
              <span className="text-white/30 text-sm font-normal">
                ({activeRules.length} active / {inactiveRules.length} inactive)
              </span>
            </h2>
          </div>
          <div className="divide-y divide-white/5">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`px-5 py-4 flex items-start justify-between gap-4 transition-colors hover:bg-white/3 ${!rule.isActive ? 'opacity-40' : ''}`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm">{rule.name}</span>
                    <StrategyBadge strategy={rule.strategy} />
                    {!rule.isActive && (
                      <span className="px-2 py-0.5 rounded-full text-xs border border-white/10 text-white/30">
                        Đã vô hiệu hóa
                      </span>
                    )}
                  </div>
                  <RuleConditionText rule={rule} />
                  <div className="flex items-center gap-4 text-xs text-white/40">
                    <span>Priority: {rule.priority}</span>
                    <span>Điều chỉnh: {rule.adjustmentPct > 0 ? '+' : ''}{rule.adjustmentPct}%</span>
                    <span>Biên: {fmtCurrency(rule.minPrice)} – {fmtCurrency(rule.maxPrice)}</span>
                  </div>
                </div>
                {rule.isActive && (
                  <button
                    onClick={() => { void handleDeactivate(rule.id) }}
                    disabled={disablingId === rule.id}
                    className="flex-shrink-0 flex items-center gap-1 text-xs text-white/30 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {disablingId === rule.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <XCircle size={14} />
                    }
                    Vô hiệu hóa
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price history */}
      {history.length > 0 && !loading && (
        <div className="glass rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowHistory(s => !s)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-white/8 hover:bg-white/3 transition-colors"
          >
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Clock size={16} className="text-orange-400" />
              Lịch sử Thay đổi Giá
              <span className="text-white/30 text-sm font-normal">({history.length})</span>
            </h2>
            {showHistory ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
          </button>
          {showHistory && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    {['Thời gian', 'Giá cũ', 'Giá mới', 'Thay đổi', 'Tồn kho lúc đó', 'Lý do', 'Trigger'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-white/40 font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(entry => (
                    <tr key={entry.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-white/60 text-xs">{fmtCurrency(entry.oldPrice)}</td>
                      <td className="px-4 py-3 text-white font-medium text-xs">{fmtCurrency(entry.newPrice)}</td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 text-xs font-medium ${entry.newPrice > entry.oldPrice ? 'text-red-400' : 'text-emerald-400'}`}>
                          {entry.newPrice > entry.oldPrice
                            ? <TrendingUp size={12} />
                            : <TrendingDown size={12} />
                          }
                          {entry.changePct > 0 ? '+' : ''}{entry.changePct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">
                        {entry.stockAtChange.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs max-w-40 truncate" title={entry.reason}>
                        {entry.reason}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 glass rounded-full text-white/40">
                          {entry.triggeredBy}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && selectedProduct && rules.length === 0 && history.length === 0 && !error && (
        <div className="glass rounded-2xl p-12 text-center space-y-3">
          <Tag size={32} className="text-white/20 mx-auto" />
          <p className="text-white/40 text-sm">Chưa có pricing rules nào cho sản phẩm này.</p>
          <p className="text-white/25 text-xs">
            Rules được tạo qua API{' '}
            <code className="bg-white/5 px-1 py-0.5 rounded">/pricing/:id/rules</code>
          </p>
        </div>
      )}
    </div>
  )
}
