'use client'

/**
 * Admin Benchmark Dashboard — So sánh 3 chiến lược distributed lock
 *
 * Mục đích:
 * - Demo trực quan sự khác biệt giữa NO_LOCK, DB_LOCK và REDIS_LUA
 * - NO_LOCK: nhanh nhưng oversell — KHÔNG AN TOÀN cho production flash sale
 * - DB_LOCK: an toàn nhưng chậm — bottleneck khi nhiều concurrent request
 * - REDIS_LUA: vừa an toàn vừa nhanh — giải pháp được chọn cho production
 *
 * Flow sử dụng:
 * 1. Nhập campaignProductId và số concurrent users
 * 2. Click "Chạy Benchmark" → gọi POST /admin/benchmark/run-all
 * 3. Hiển thị bảng so sánh với màu sắc trực quan (đỏ/vàng/xanh)
 * 4. Kết luận recommendation cuối trang
 */

import { useState } from 'react'
import {
  FlaskConical, Zap, Database, Shield, AlertTriangle,
  CheckCircle, XCircle, Loader2, ChevronRight, BarChart3, Clock
} from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { formatDate } from '@/lib/utils'
import type { BenchmarkComparison, BenchmarkResult } from '@/types'

// ─── Hằng số ─────────────────────────────────────────────────────────────────

/** Giá trị mặc định cho form demo */
const DEFAULT_USERS = 100
const DEFAULT_STOCK = 50
const DEFAULT_PRODUCT_ID = ''

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Hiển thị một metric số với label */
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

/** Card kết quả benchmark cho một strategy */
function StrategyCard({
  result,
  isWinner
}: {
  result: BenchmarkResult
  isWinner: boolean
}) {
  const strategyMeta: Record<string, { label: string; icon: React.ReactNode; desc: string; color: string }> = {
    NO_LOCK: {
      label: 'Không khóa (NO_LOCK)',
      icon: <AlertTriangle size={20} className="text-red-400" />,
      desc: 'GET stock → check → DECRBY — race condition xảy ra',
      color: 'border-red-500/30'
    },
    DB_LOCK: {
      label: 'Database Lock (DB_LOCK)',
      icon: <Database size={20} className="text-yellow-400" />,
      desc: 'SELECT FOR UPDATE — serialize tại DB, an toàn nhưng chậm',
      color: 'border-yellow-500/30'
    },
    REDIS_LUA: {
      label: 'Redis Lua Script',
      icon: <Shield size={20} className="text-emerald-400" />,
      desc: 'Atomic check-and-decrement trong single-threaded Redis',
      color: 'border-emerald-500/30'
    }
  }

  const meta = strategyMeta[result.strategy] ?? {
    label: result.strategy, icon: null, desc: '', color: ''
  }

  return (
    <div className={`glass rounded-2xl p-5 space-y-4 border ${meta.color} ${isWinner ? 'ring-1 ring-emerald-500/40' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {meta.icon}
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

      {/* Correctness badge */}
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

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricBox
          label="Throughput"
          value={result.throughputRPS}
          unit="RPS"
          highlight={result.throughputRPS > 0}
        />
        <MetricBox
          label="Thành công"
          value={result.succeeded}
          unit={`/ ${result.concurrentUsers}`}
          highlight={result.isCorrect}
        />
        <MetricBox label="P50 Latency" value={result.p50LatencyMs} unit="ms" />
        <MetricBox
          label="P95 Latency"
          value={result.p95LatencyMs}
          unit="ms"
          danger={result.p95LatencyMs > 500}
        />
        <MetricBox
          label="Tồn kho cuối"
          value={result.finalStock ?? '?'}
          danger={(result.finalStock ?? 0) < 0}
        />
        <MetricBox
          label="Oversell"
          value={result.oversellCount}
          danger={result.oversellCount > 0}
        />
      </div>

      {/* Time */}
      <p className="text-white/30 text-xs text-right">
        <Clock size={10} className="inline mr-1" />
        Tổng: {result.totalTimeMs}ms
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminBenchmarkPage() {
  const [campaignProductId, setCampaignProductId] = useState(DEFAULT_PRODUCT_ID)
  const [concurrentUsers, setConcurrentUsers] = useState(DEFAULT_USERS)
  const [stockAmount, setStockAmount] = useState(DEFAULT_STOCK)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BenchmarkComparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ranAt, setRanAt] = useState<Date | null>(null)

  /**
   * Gọi API benchmark.
   *
   * Edge cases:
   * - campaignProductId rỗng → hiển thị error validation
   * - concurrentUsers > stockAmount → oversell chắc chắn xảy ra với NO_LOCK (intentional demo)
   * - API timeout → thông báo lỗi, không crash
   */
  const handleRun = async () => {
    const pid = campaignProductId.trim()
    if (!pid) {
      setError('Vui lòng nhập Campaign Product ID để benchmark.')
      return
    }
    if (concurrentUsers < 10 || concurrentUsers > 1000) {
      setError('Số concurrent users phải từ 10 đến 1000.')
      return
    }
    if (stockAmount < 1 || stockAmount > 500) {
      setError('Stock amount phải từ 1 đến 500.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await adminService.runBenchmarkAll({
        campaignProductId: pid,
        concurrentUsers,
        stockAmount
      })
      setResult(data)
      setRanAt(new Date())
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể chạy benchmark. Kiểm tra Campaign Product ID có tồn tại không.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-violet-500/15 border border-violet-500/20">
          <FlaskConical size={24} className="text-violet-400" />
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold">Benchmark Distributed Lock</h1>
          <p className="text-white/50 text-sm mt-1">
            So sánh trực tiếp 3 chiến lược xử lý concurrent stock — chứng minh vì sao Redis Lua Script
            được chọn cho production flash sale
          </p>
        </div>
      </div>

      {/* Theory cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: <AlertTriangle size={16} className="text-red-400" />,
            label: 'NO_LOCK',
            desc: 'Nhanh nhất nhưng OVERSELL — không dùng được trong flash sale thực',
            color: 'border-red-500/20 bg-red-500/5'
          },
          {
            icon: <Database size={16} className="text-yellow-400" />,
            label: 'DB_LOCK',
            desc: 'An toàn với SELECT FOR UPDATE nhưng bottleneck tại DB khi burst traffic',
            color: 'border-yellow-500/20 bg-yellow-500/5'
          },
          {
            icon: <Shield size={16} className="text-emerald-400" />,
            label: 'REDIS_LUA',
            desc: 'Atomic Lua script trong single-threaded Redis — zero oversell + cao throughput',
            color: 'border-emerald-500/20 bg-emerald-500/5'
          }
        ].map(item => (
          <div key={item.label} className={`glass rounded-xl p-4 border ${item.color}`}>
            <div className="flex items-center gap-2 mb-2">
              {item.icon}
              <span className="text-white font-mono text-sm font-medium">{item.label}</span>
            </div>
            <p className="text-white/50 text-xs leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Config form */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <BarChart3 size={18} className="text-indigo-400" />
          Cấu hình Benchmark
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-1">
            <label className="text-white/60 text-sm">Campaign Product ID</label>
            <input
              type="text"
              value={campaignProductId}
              onChange={e => setCampaignProductId(e.target.value)}
              placeholder="Nhập ID sản phẩm trong chiến dịch"
              className="w-full glass rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <p className="text-white/30 text-xs">
              Lấy từ trang chi tiết campaign, mục &quot;Campaign Products&quot;
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-white/60 text-sm">
              Concurrent Users <span className="text-white/30">(10–1000)</span>
            </label>
            <input
              type="number"
              min={10}
              max={1000}
              value={concurrentUsers}
              onChange={e => setConcurrentUsers(Number(e.target.value))}
              className="w-full glass rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <p className="text-white/30 text-xs">
              Số request đồng thời mô phỏng — nên &gt; stockAmount để thấy race condition
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-white/60 text-sm">
              Stock Amount <span className="text-white/30">(1–500)</span>
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={stockAmount}
              onChange={e => setStockAmount(Number(e.target.value))}
              className="w-full glass rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <p className="text-white/30 text-xs">
              Số lượng hàng tồn kho giả lập
            </p>
          </div>
        </div>

        {/* Gợi ý cấu hình demo ấn tượng */}
        <div className="flex flex-wrap gap-2">
          <span className="text-white/40 text-xs self-center">Gợi ý demo:</span>
          {[
            { label: 'Nhẹ (50 users / 20 stock)', users: 50, stock: 20 },
            { label: 'Trung bình (100 / 50)', users: 100, stock: 50 },
            { label: 'Nặng (200 / 100)', users: 200, stock: 100 },
          ].map(preset => (
            <button
              key={preset.label}
              onClick={() => { setConcurrentUsers(preset.users); setStockAmount(preset.stock) }}
              className="text-xs px-3 py-1.5 glass rounded-lg text-white/60 hover:text-white transition-colors"
            >
              {preset.label}
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
          onClick={handleRun}
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang chạy benchmark... (có thể mất 10–30 giây)
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Zap size={16} />
              Chạy Benchmark So Sánh
              <ChevronRight size={16} />
            </span>
          )}
        </button>
      </div>

      {/* Kết quả */}
      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Tiêu đề kết quả */}
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Kết quả So sánh</h2>
            {ranAt && (
              <span className="text-white/30 text-xs">
                Chạy lúc {formatDate(ranAt.toISOString())}
              </span>
            )}
          </div>

          {/* 3 strategy cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StrategyCard result={result.noLock} isWinner={false} />
            <StrategyCard result={result.dbLock} isWinner={false} />
            <StrategyCard result={result.redisLua} isWinner={true} />
          </div>

          {/* So sánh throughput visual */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <h3 className="text-white font-medium flex items-center gap-2">
              <Zap size={16} className="text-indigo-400" />
              So sánh Throughput (RPS)
            </h3>
            {[
              { label: 'NO_LOCK', value: result.noLock.throughputRPS, safe: false, color: 'bg-red-500' },
              { label: 'DB_LOCK', value: result.dbLock.throughputRPS, safe: true, color: 'bg-yellow-500' },
              { label: 'REDIS_LUA', value: result.redisLua.throughputRPS, safe: true, color: 'bg-emerald-500' },
            ].map(item => {
              const maxRps = Math.max(result.noLock.throughputRPS, result.dbLock.throughputRPS, result.redisLua.throughputRPS, 1)
              const pct = Math.round((item.value / maxRps) * 100)
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-white/70">
                      <span className="font-mono">{item.label}</span>
                      {!item.safe && (
                        <span className="text-red-400 text-xs">(KHÔNG AN TOÀN)</span>
                      )}
                    </span>
                    <span className="text-white font-medium">{item.value} RPS</span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${item.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Kết luận */}
          <div className="glass rounded-2xl p-6 border border-emerald-500/20 bg-emerald-500/5 space-y-3">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-emerald-400" />
              <h3 className="text-emerald-300 font-semibold">Kết luận</h3>
            </div>
            <p className="text-white/70 text-sm leading-relaxed">{result.conclusion}</p>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <CheckCircle size={12} className="text-emerald-400" />
              <span>Khuyến nghị production: <span className="font-mono text-emerald-300">REDIS_LUA</span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
