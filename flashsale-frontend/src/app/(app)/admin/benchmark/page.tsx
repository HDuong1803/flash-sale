'use client'

/**
 * Admin Benchmark Dashboard — Async Background Jobs
 *
 * Tab 1 "Chạy mới":
 *   - Chọn chiến dịch → chọn sản phẩm → tự điền campaignProductId
 *   - POST /admin/benchmark/start → nhận runId (202 Accepted, không block)
 *   - Poll GET /admin/benchmark/runs/:id mỗi 2s cho đến khi COMPLETED | FAILED
 *
 * Tab 2 "Lịch sử":
 *   - GET /admin/benchmark/history → danh sách tất cả runs
 *   - Inline expand kết quả
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FlaskConical, Zap, Database, Shield, AlertTriangle,
  CheckCircle, XCircle, Loader2, BarChart3, Clock,
  Layers, History, RefreshCw, ChevronDown, ChevronUp, Package, StopCircle
} from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { campaignService } from '@/services/campaign.service'
import { formatCurrency, formatDate } from '@/lib/utils'
import type {
  BenchmarkResult, BenchmarkComparison, BenchmarkRun,
  StrategyMode, BenchmarkRunStatus, Campaign, CampaignProduct
} from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000

const STRATEGY_META: Record<StrategyMode, {
  label: string
  shortLabel: string
  icon: React.ReactNode
  desc: string
  borderColor: string
  bgColor: string
  textColor: string
  badgeClass: string
}> = {
  NO_LOCK: {
    label: 'Không khóa (NO_LOCK)',
    shortLabel: 'NO_LOCK',
    icon: <AlertTriangle size={16} />,
    desc: 'Xem race condition thực tế',
    borderColor: 'border-red-500/30',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-400',
    badgeClass: 'bg-red-500/15 border-red-500/30 text-red-300'
  },
  DB_LOCK: {
    label: 'Database Lock (DB_LOCK)',
    shortLabel: 'DB_LOCK',
    icon: <Database size={16} />,
    desc: 'Khóa DB (SELECT FOR UPDATE)',
    borderColor: 'border-yellow-500/30',
    bgColor: 'bg-yellow-500/10',
    textColor: 'text-yellow-400',
    badgeClass: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300'
  },
  REDIS_LUA: {
    label: 'Redis Lua Script',
    shortLabel: 'REDIS_LUA',
    icon: <Shield size={16} />,
    desc: 'Khuyến nghị — atomic + nhanh',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
    badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
  },
  ALL: {
    label: 'So sánh cả 3 strategies',
    shortLabel: 'ALL',
    icon: <Layers size={16} />,
    desc: 'Chạy tuần tự và so sánh',
    borderColor: 'border-indigo-500/30',
    bgColor: 'bg-indigo-500/10',
    textColor: 'text-indigo-400',
    badgeClass: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
  }
}

const STATUS_META: Record<BenchmarkRunStatus, { label: string; class: string; icon: React.ReactNode }> = {
  PENDING: {
    label: 'Đang chờ',
    class: 'bg-white/10 border-white/20 text-white/60',
    icon: <Clock size={12} />
  },
  RUNNING: {
    label: 'Đang chạy',
    class: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
    icon: <Loader2 size={12} className="animate-spin" />
  },
  COMPLETED: {
    label: 'Hoàn thành',
    class: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    icon: <CheckCircle size={12} />
  },
  FAILED: {
    label: 'Thất bại',
    class: 'bg-red-500/15 border-red-500/30 text-red-300',
    icon: <XCircle size={12} />
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricBox({
  label,
  value,
  unit = '',
  highlight = false,
  danger = false
}: {
  label: string
  value: string | number
  unit?: string
  highlight?: boolean
  danger?: boolean
}) {
  return (
    <div className="glass rounded-xl p-3 text-center">
      <p className="text-white/50 text-xs mb-1">{label}</p>
      <p className={`text-lg font-bold ${danger ? 'text-red-400' : highlight ? 'text-emerald-400' : 'text-white'}`}>
        {value}
        {unit && <span className="text-xs font-normal text-white/40 ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}

function StrategyCard({
  result,
  isWinner = false
}: {
  result: BenchmarkResult
  isWinner?: boolean
}) {
  const meta = STRATEGY_META[result.strategy as StrategyMode] ?? STRATEGY_META.REDIS_LUA

  return (
    <div className={`glass rounded-2xl p-5 space-y-4 border ${meta.borderColor} ${isWinner ? 'ring-1 ring-emerald-500/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={meta.textColor}>{meta.icon}</span>
          <div>
            <h3 className="text-white font-semibold text-sm">{meta.label}</h3>
            <p className="text-white/40 text-xs mt-0.5">{meta.desc}</p>
          </div>
        </div>
        {isWinner && (
          <span className="flex-shrink-0 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs px-2 py-0.5 rounded-full">
            Khuyến nghị
          </span>
        )}
      </div>

      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${result.isCorrect && result.oversellCount === 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
        {result.isCorrect && result.oversellCount === 0 ? (
          <>
            <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
            <span className="text-emerald-300 text-sm font-medium">Zero Oversell ✓</span>
          </>
        ) : (
          <>
            <XCircle size={16} className="text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-sm font-medium">
              Oversell: {result.oversellCount} lần — KHÔNG AN TOÀN
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricBox label="Thông lượng" value={result.throughputRPS} unit="RPS" highlight={result.throughputRPS > 0} />
        <MetricBox label="Thành công" value={result.succeeded} unit={`/ ${result.concurrentUsers}`} highlight={result.isCorrect} />
        <MetricBox label="Độ trễ P50" value={result.p50LatencyMs} unit="ms" />
        <MetricBox label="Độ trễ P95" value={result.p95LatencyMs} unit="ms" danger={result.p95LatencyMs > 500} />
        <MetricBox label="Tồn kho cuối" value={result.finalStock ?? '?'} danger={(result.finalStock ?? 0) < 0} />
        <MetricBox label="Bán vượt (Oversell)" value={result.oversellCount} danger={result.oversellCount > 0} />
      </div>

      <p className="text-white/30 text-xs text-right">
        <Clock size={10} className="inline mr-1" />
        Tổng: {result.totalTimeMs}ms
      </p>
    </div>
  )
}

function ComparisonResult({ data }: { data: BenchmarkComparison }) {
  const maxRps = Math.max(data.noLock.throughputRPS, data.dbLock.throughputRPS, data.redisLua.throughputRPS, 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StrategyCard result={data.noLock} isWinner={data.recommendation === 'NO_LOCK'} />
        <StrategyCard result={data.dbLock} isWinner={data.recommendation === 'DB_LOCK'} />
        <StrategyCard result={data.redisLua} isWinner={data.recommendation === 'REDIS_LUA'} />
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Zap size={16} className="text-indigo-400" />
          So sánh thông lượng (RPS)
        </h3>
        {[
          { label: 'NO_LOCK', value: data.noLock.throughputRPS, safe: false, color: 'bg-red-500' },
          { label: 'DB_LOCK', value: data.dbLock.throughputRPS, safe: true, color: 'bg-yellow-500' },
          { label: 'REDIS_LUA', value: data.redisLua.throughputRPS, safe: true, color: 'bg-emerald-500' }
        ].map(item => {
          const pct = Math.round((item.value / maxRps) * 100)
          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-white/70">
                  <span className="font-mono">{item.label}</span>
                  {!item.safe && <span className="text-red-400 text-xs">(KHÔNG AN TOÀN)</span>}
                </span>
                <span className="text-white font-medium">{item.value} RPS</span>
              </div>
              <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${item.color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="glass rounded-2xl p-6 border border-emerald-500/20 bg-emerald-500/5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-emerald-400" />
          <h3 className="text-emerald-300 font-semibold">Kết luận</h3>
        </div>
        <p className="text-white/70 text-sm leading-relaxed">{data.conclusion}</p>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <CheckCircle size={12} className="text-emerald-400" />
          <span>Khuyến nghị cho production: <span className="font-mono text-emerald-300">{data.recommendation}</span></span>
        </div>
      </div>
    </div>
  )
}

function SingleResult({ data }: { data: BenchmarkResult }) {
  const isWinner = data.strategy === 'REDIS_LUA'
  return (
    <div className="max-w-md">
      <StrategyCard result={data} isWinner={isWinner} />
    </div>
  )
}

function StatusBadge({ status }: { status: BenchmarkRunStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs ${meta.class}`}>
      {meta.icon}
      {meta.label}
    </span>
  )
}

function RunJobCard({ runId, onComplete }: { runId: string; onComplete: (run: BenchmarkRun) => void }) {
  const [run, setRun] = useState<BenchmarkRun | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await adminService.getBenchmarkRun(runId)
        setRun(data)

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          stopPolling()
          onComplete(data)
        }
      } catch {
        // withRetry xử lý lỗi tạm thời — bỏ qua, retry lần sau
      }
    }

    void poll()
    pollingRef.current = setInterval(() => { void poll() }, POLL_INTERVAL_MS)

    return stopPolling
  }, [runId, stopPolling, onComplete])

  if (!run) {
    return (
      <div className="glass rounded-2xl p-6 flex items-center gap-3">
        <Loader2 size={20} className="text-indigo-400 animate-spin" />
        <div>
          <p className="text-white font-medium text-sm">Đang khởi tạo tác vụ...</p>
          <p className="text-white/40 text-xs font-mono mt-0.5">{runId}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-3 border border-indigo-500/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {(run.status === 'PENDING' || run.status === 'RUNNING') && (
            <Loader2 size={20} className="text-indigo-400 animate-spin flex-shrink-0" />
          )}
          {run.status === 'COMPLETED' && <CheckCircle size={20} className="text-emerald-400 flex-shrink-0" />}
          {run.status === 'FAILED' && <XCircle size={20} className="text-red-400 flex-shrink-0" />}
          <div>
            <p className="text-white font-medium text-sm">Tác vụ đang chạy</p>
            <p className="text-white/40 text-xs font-mono mt-0.5">{run.id}</p>
          </div>
        </div>
        <StatusBadge status={run.status} />
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="glass rounded-lg p-2 text-center">
          <p className="text-white/40">Chiến lược</p>
          <p className="text-white font-mono font-medium">{run.strategyMode}</p>
        </div>
        <div className="glass rounded-lg p-2 text-center">
          <p className="text-white/40">Người dùng</p>
          <p className="text-white font-medium">{run.concurrentUsers.toLocaleString()}</p>
        </div>
        <div className="glass rounded-lg p-2 text-center">
          <p className="text-white/40">Tồn kho</p>
          <p className="text-white font-medium">{run.stockAmount}</p>
        </div>
      </div>

      {run.status === 'RUNNING' && (
        <div className="flex items-center gap-2 text-xs text-indigo-300/70">
          <Loader2 size={10} className="animate-spin" />
          Đang xử lý... cập nhật mỗi {POLL_INTERVAL_MS / 1000} giây
        </div>
      )}

      {run.status === 'FAILED' && run.errorMessage && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-xs">{run.errorMessage}</p>
        </div>
      )}
    </div>
  )
}

// ─── Tab 1: Chạy mới ──────────────────────────────────────────────────────────

function RunTab() {
  // ── Campaign / product picker ────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')

  useEffect(() => {
    campaignService
      .getAll()
      .then(list => setCampaigns(list.filter(c => (c.campaignProducts?.length ?? 0) > 0)))
      .catch(() => {})
      .finally(() => setLoadingCampaigns(false))
  }, [])

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) ?? null
  const products: CampaignProduct[] = selectedCampaign?.campaignProducts ?? []
  const selectedProduct = products.find(p => p.id === selectedProductId) ?? null

  const handleCampaignChange = (id: string) => {
    setSelectedCampaignId(id)
    setSelectedProductId('')
  }

  // ── Benchmark config ─────────────────────────────────────────────────────
  const [concurrentUsers, setConcurrentUsers] = useState(100)
  const [stockAmount, setStockAmount] = useState(50)
  const [strategy, setStrategy] = useState<StrategyMode>('REDIS_LUA')
  const [submitting, setSubmitting] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [completedRun, setCompletedRun] = useState<BenchmarkRun | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Auto-fill stockAmount từ remainingQuantity khi chọn sản phẩm
  useEffect(() => {
    if (selectedProduct) {
      setStockAmount(Math.max(1, Math.min(selectedProduct.remainingQuantity, 500)))
    }
  }, [selectedProduct])

  const handleComplete = useCallback((run: BenchmarkRun) => {
    setCompletedRun(run)
    setActiveRunId(null)
  }, [])

  const handleStart = async () => {
    if (!selectedProductId) {
      setError('Vui lòng chọn sản phẩm trong chiến dịch.')
      return
    }
    if (concurrentUsers < 1) {
      setError('Số người dùng đồng thời phải ít nhất là 1.')
      return
    }
    if (stockAmount < 1) {
      setError('Số lượng hàng phải ít nhất là 1.')
      return
    }

    setSubmitting(true)
    setError(null)
    setCompletedRun(null)
    setActiveRunId(null)

    try {
      const { runId } = await adminService.startBenchmark({
        campaignProductId: selectedProductId,
        concurrentUsers,
        stockAmount,
        strategyMode: strategy,
      })
      setActiveRunId(runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể bắt đầu benchmark.')
    } finally {
      setSubmitting(false)
    }
  }

  const strategyOrder: StrategyMode[] = ['NO_LOCK', 'DB_LOCK', 'REDIS_LUA', 'ALL']

  return (
    <div className="space-y-6">
      {/* Config form */}
      <div className="glass rounded-2xl p-6 space-y-5">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <BarChart3 size={18} className="text-indigo-400" />
          Cấu hình Benchmark
        </h2>

        {/* Strategy selector */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Chiến lược</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {strategyOrder.map(s => {
              const meta = STRATEGY_META[s]
              const active = strategy === s
              return (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className={`glass rounded-xl p-3 border text-left transition-all ${active ? `${meta.borderColor} ${meta.bgColor} ring-1 ring-white/10` : 'border-white/10 hover:border-white/20'}`}
                >
                  <div className={`flex items-center gap-1.5 mb-1 ${active ? meta.textColor : 'text-white/50'}`}>
                    {meta.icon}
                    <span className="font-mono text-xs font-semibold">{meta.shortLabel}</span>
                  </div>
                  <p className="text-white/40 text-xs leading-snug">{meta.desc}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Campaign + Product picker */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-white/60 text-sm">Chiến dịch</label>
            {loadingCampaigns ? (
              <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-2 text-white/40 text-sm">
                <Loader2 size={14} className="animate-spin" />
                Đang tải...
              </div>
            ) : (
              <select
                value={selectedCampaignId}
                onChange={e => handleCampaignChange(e.target.value)}
                className="w-full glass rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-1 focus:ring-indigo-500/50 bg-transparent cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="" className="bg-slate-900">-- Chọn chiến dịch --</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id} className="bg-slate-900">
                    {c.name} · {c.status} · {c.campaignProducts?.length ?? 0} SP
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-white/60 text-sm">Sản phẩm</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              disabled={products.length === 0}
              className="w-full glass rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-1 focus:ring-indigo-500/50 bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ colorScheme: 'dark' }}
            >
              <option value="" className="bg-slate-900">-- Chọn sản phẩm --</option>
              {products.map(p => (
                <option key={p.id} value={p.id} className="bg-slate-900">
                  {p.product?.name ?? p.productId} · {formatCurrency(p.salePrice)} · còn {p.remainingQuantity}
                </option>
              ))}
            </select>
            {selectedProduct && (
              <p className="text-white/30 text-xs font-mono px-1 truncate">
                <Package size={10} className="inline mr-1 text-indigo-400" />
                {selectedProductId}
              </p>
            )}
          </div>
        </div>

        {/* Concurrent Users + Stock Amount */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-white/60 text-sm">Người dùng đồng thời</label>
            <input
              type="number"
              min={1}
              value={concurrentUsers}
              onChange={e => setConcurrentUsers(Math.max(1, Number(e.target.value)))}
              className="w-full glass rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-white/60 text-sm">
              Số lượng hàng
              {selectedProduct && (
                <span className="text-white/30 ml-1.5 text-xs">
                  (thực tế: {selectedProduct.remainingQuantity})
                </span>
              )}
            </label>
            <input
              type="number"
              min={1}
              value={stockAmount}
              onChange={e => setStockAmount(Math.max(1, Number(e.target.value)))}
              className="w-full glass rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-white/40 text-xs">Gợi ý users/stock:</span>
          {[
            { label: '100/50', users: 100, stock: 50 },
            { label: '500/100', users: 500, stock: 100 },
            { label: '2000/100', users: 2000, stock: 100 },
            { label: '10000/100', users: 10000, stock: 100 },
            { label: '50000/100', users: 50000, stock: 100 },
            { label: '100000/100', users: 100000, stock: 100 }
          ].map(p => (
            <button
              key={p.label}
              onClick={() => { setConcurrentUsers(p.users); setStockAmount(p.stock) }}
              className="text-xs px-3 py-1.5 glass rounded-lg text-white/60 hover:text-white transition-colors border border-white/10 hover:border-white/20"
            >
              {p.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={submitting || activeRunId !== null || !selectedProductId}
          className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang tạo job...
            </span>
          ) : activeRunId ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Benchmark đang chạy...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Zap size={16} />
              Bắt đầu Benchmark
            </span>
          )}
        </button>
      </div>

      {/* Active job card */}
      {activeRunId && (
        <RunJobCard
          key={activeRunId}
          runId={activeRunId}
          onComplete={handleComplete}
        />
      )}

      {/* Completed result */}
      {completedRun?.status === 'COMPLETED' && completedRun.result && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Kết quả Benchmark</h2>
            <div className="flex items-center gap-3">
              <StatusBadge status={completedRun.status} />
              {completedRun.completedAt && (
                <span className="text-white/30 text-xs">
                  {formatDate(completedRun.completedAt)}
                </span>
              )}
            </div>
          </div>

          {completedRun.strategyMode === 'ALL' ? (
            <ComparisonResult data={completedRun.result as BenchmarkComparison} />
          ) : (
            <SingleResult data={completedRun.result as BenchmarkResult} />
          )}
        </div>
      )}

      {completedRun?.status === 'FAILED' && (
        <div className="glass rounded-2xl p-6 border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={18} className="text-red-400" />
            <h3 className="text-red-300 font-semibold">Benchmark thất bại</h3>
          </div>
          <p className="text-white/60 text-sm">{completedRun.errorMessage ?? 'Lỗi không xác định'}</p>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Lịch sử ──────────────────────────────────────────────────────────

function HistoryRunRow({ run, onKilled }: { run: BenchmarkRun; onKilled: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [killing, setKilling] = useState(false)
  const meta = STRATEGY_META[run.strategyMode]

  const durationMs = run.completedAt
    ? new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime()
    : null

  const handleKill = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Dừng benchmark run này?')) return
    setKilling(true)
    try {
      await adminService.killBenchmarkRun(run.id)
      onKilled()
    } catch {
      // ignore
    } finally {
      setKilling(false)
    }
  }

  return (
    <div className="glass rounded-xl border border-white/8 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
      >
        <div className={`flex-shrink-0 p-1.5 rounded-lg ${meta.bgColor}`}>
          <span className={meta.textColor}>{meta.icon}</span>
        </div>

        <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-5 gap-2 items-center">
          <div className="col-span-2 md:col-span-1">
            <p className="text-white/50 text-xs">Thời gian</p>
            <p className="text-white text-xs font-medium truncate">{formatDate(run.createdAt)}</p>
          </div>
          <div>
            <p className="text-white/50 text-xs">Chiến lược</p>
            <p className={`text-xs font-mono font-semibold ${meta.textColor}`}>{run.strategyMode}</p>
          </div>
          <div>
            <p className="text-white/50 text-xs">Người dùng / Tồn kho</p>
            <p className="text-white text-xs">{run.concurrentUsers.toLocaleString()} / {run.stockAmount}</p>
          </div>
          <div>
            <p className="text-white/50 text-xs">Trạng thái</p>
            <StatusBadge status={run.status} />
          </div>
          <div>
            <p className="text-white/50 text-xs">Thời lượng</p>
            <p className="text-white text-xs">
              {durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : '—'}
            </p>
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          {(run.status === 'RUNNING' || run.status === 'PENDING') && (
            <button
              onClick={handleKill}
              disabled={killing}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
            >
              {killing ? <Loader2 size={10} className="animate-spin" /> : <StopCircle size={10} />}
              Dừng
            </button>
          )}
          <span className="text-white/40">
            {run.result
              ? expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />
              : null}
          </span>
        </div>
      </button>

      {expanded && run.result && (
        <div className="px-4 pb-4 border-t border-white/8 pt-4">
          {run.strategyMode === 'ALL' ? (
            <ComparisonResult data={run.result as BenchmarkComparison} />
          ) : (
            <SingleResult data={run.result as BenchmarkResult} />
          )}
        </div>
      )}

      {expanded && run.status === 'FAILED' && (
        <div className="px-4 pb-4 border-t border-white/8 pt-4">
          <p className="text-red-300 text-sm">{run.errorMessage ?? 'Lỗi không xác định'}</p>
        </div>
      )}
    </div>
  )
}

function HistoryTab() {
  const [runs, setRuns] = useState<BenchmarkRun[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const LIMIT = 20

  const load = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminService.getBenchmarkHistory(p, LIMIT)
      setRuns(data.items)
      setTotal(data.total)
      setPage(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải lịch sử.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(1) }, [load])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-sm">{total} lần chạy benchmark</p>
        <button
          onClick={() => { void load(page) }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs glass rounded-lg px-3 py-1.5 text-white/60 hover:text-white transition-colors border border-white/10 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="text-indigo-400 animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center">
          <FlaskConical size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Chưa có benchmark nào được chạy</p>
        </div>
      )}

      {!loading && runs.map(run => (
        <HistoryRunRow key={run.id} run={run} onKilled={() => { void load(page) }} />
      ))}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => { void load(page - 1) }}
            disabled={page <= 1}
            className="glass rounded-lg px-3 py-1.5 text-xs text-white/60 hover:text-white disabled:opacity-30 transition-colors border border-white/10"
          >
            Trước
          </button>
          <span className="text-white/40 text-xs">{page} / {totalPages}</span>
          <button
            onClick={() => { void load(page + 1) }}
            disabled={page >= totalPages}
            className="glass rounded-lg px-3 py-1.5 text-xs text-white/60 hover:text-white disabled:opacity-30 transition-colors border border-white/10"
          >
            Sau
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'run' | 'history'

export default function AdminBenchmarkPage() {
  const [activeTab, setActiveTab] = useState<Tab>('run')

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-violet-500/15 border border-violet-500/20">
          <FlaskConical size={24} className="text-violet-400" />
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold">Đánh giá hiệu năng</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-xl p-1 max-w-xs">
        {([['run', <Zap key="z" size={14} />, 'Chạy kịch bản'], ['history', <History key="h" size={14} />, 'Lịch sử']] as [Tab, React.ReactNode, string][]).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${activeTab === id ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/30' : 'text-white/50 hover:text-white'}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'run' && <RunTab />}
      {activeTab === 'history' && <HistoryTab />}
    </div>
  )
}
