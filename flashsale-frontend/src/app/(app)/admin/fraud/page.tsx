'use client'

/**
 * Admin Fraud Detection Dashboard
 *
 * Tính năng:
 * - Thống kê tổng quan (total events, blocked, block rate, top IPs)
 * - Danh sách fraud events với filter blocked/tất cả, phân trang
 * - Quản lý IP blacklist (xem, thêm, xóa)
 *
 * Flow:
 * 1. Load stats + events + blacklist song song khi mount
 * 2. Admin chọn period → re-fetch stats
 * 3. Admin toggle filter "chỉ blocked" → re-fetch events
 * 4. Admin thêm IP → POST blacklist → refresh blacklist
 * 5. Admin xóa IP → DELETE blacklist/:ip → refresh blacklist
 */

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldAlert, ShieldOff, Ban, CheckCircle2, AlertTriangle,
  RefreshCw, Loader2, Trash2, Plus, ChevronLeft, ChevronRight,
  Info,
} from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { formatDate } from '@/lib/utils'
import type { FraudStats, FraudEvent, IpBlacklistEntry } from '@/types'

// ─── Hằng số ─────────────────────────────────────────────────────────────────

type Period = '1h' | '6h' | '24h' | '7d' | '30d'
const PERIODS: { value: Period; label: string }[] = [
  { value: '1h', label: '1 giờ' },
  { value: '6h', label: '6 giờ' },
  { value: '24h', label: '24 giờ' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
]
const PAGE_SIZE = 15

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Ô thống kê đơn giản với icon */
function StatCard({
  label,
  value,
  sub,
  icon,
  danger,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-sm">{label}</p>
        {icon}
      </div>
      <p className={`text-2xl font-bold ${danger ? 'text-red-400' : 'text-white'}`}>
        {value}
      </p>
      {sub && <p className="text-white/40 text-xs">{sub}</p>}
    </div>
  )
}

/** Badge rủi ro dựa trên riskScore */
function RiskBadge({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30">
        Nguy hiểm {score}
      </span>
    )
  }
  if (score >= 50) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
        Trung bình {score}
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white/50 border border-white/10">
      Thấp {score}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminFraudPage() {
  // ── State chính ──
  const [period, setPeriod] = useState<Period>('24h')
  const [stats, setStats] = useState<FraudStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [events, setEvents] = useState<FraudEvent[]>([])
  const [eventsTotal, setEventsTotal] = useState(0)
  const [eventsPage, setEventsPage] = useState(1)
  const [onlyBlocked, setOnlyBlocked] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(true)

  const [blacklist, setBlacklist] = useState<IpBlacklistEntry[]>([])
  const [blacklistLoading, setBlacklistLoading] = useState(true)

  // ── State form thêm IP ──
  const [newIp, setNewIp] = useState('')
  const [newReason, setNewReason] = useState('')
  const [newHours, setNewHours] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // ─── Fetch stats ──────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const data = await adminService.getFraudStats(period)
      setStats(data)
    } catch {
      // stats không load được → giữ null, user thấy empty state
    } finally {
      setStatsLoading(false)
    }
  }, [period])

  // ─── Fetch events ─────────────────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const res = await adminService.getFraudEvents({
        page: eventsPage,
        limit: PAGE_SIZE,
        blocked: onlyBlocked || undefined,
      })
      setEvents(res.data)
      setEventsTotal(res.total)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }, [eventsPage, onlyBlocked])

  // ─── Fetch blacklist ──────────────────────────────────────────────────────

  const loadBlacklist = useCallback(async () => {
    setBlacklistLoading(true)
    try {
      const data = await adminService.getIpBlacklist()
      setBlacklist(data)
    } catch {
      setBlacklist([])
    } finally {
      setBlacklistLoading(false)
    }
  }, [])

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => { void loadStats() }, [loadStats])
  useEffect(() => { void loadEvents() }, [loadEvents])
  useEffect(() => { void loadBlacklist() }, [loadBlacklist])

  // Reset trang về 1 khi đổi filter
  useEffect(() => { setEventsPage(1) }, [onlyBlocked])

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleAddIp = async () => {
    const ip = newIp.trim()
    const reason = newReason.trim()
    if (!ip || !reason) {
      setAddError('IP và lý do là bắt buộc.')
      return
    }
    // Validate IPv4/IPv6 pattern đơn giản
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
    const ipv6 = /^[0-9a-fA-F:]+$/
    if (!ipv4.test(ip) && !ipv6.test(ip)) {
      setAddError('Địa chỉ IP không hợp lệ.')
      return
    }

    setAddLoading(true)
    setAddError(null)
    try {
      const hours = newHours ? Number(newHours) : undefined
      await adminService.blacklistIp(ip, reason, hours)
      setNewIp('')
      setNewReason('')
      setNewHours('')
      await loadBlacklist()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Không thể thêm IP.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRemoveIp = async (ip: string) => {
    try {
      await adminService.removeFromBlacklist(ip)
      await loadBlacklist()
    } catch {
      // best-effort
    }
  }

  const totalPages = Math.max(1, Math.ceil(eventsTotal / PAGE_SIZE))

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/20">
          <ShieldAlert size={24} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold">Phát hiện Gian lận</h1>
          <p className="text-white/50 text-sm mt-1">
            Giám sát realtime fraud events, quản lý IP blacklist và phân tích rủi ro
          </p>
        </div>
      </div>

      {/* ── Period selector ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-white/40 text-sm">Khoảng thời gian:</span>
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
              period === p.value
                ? 'bg-indigo-500/25 border border-indigo-500/40 text-indigo-300'
                : 'glass text-white/50 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => { void loadStats() }}
          className="ml-auto glass p-2 rounded-lg text-white/40 hover:text-white transition-colors"
          title="Làm mới"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Stats cards ────────────────────────────────────────────────────── */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Tổng events"
            value={stats.total.toLocaleString()}
            icon={<Info size={18} className="text-white/30" />}
          />
          <StatCard
            label="Đã chặn"
            value={stats.blocked.toLocaleString()}
            icon={<ShieldOff size={18} className="text-red-400" />}
            danger={stats.blocked > 0}
          />
          <StatCard
            label="Tỉ lệ chặn"
            value={`${(stats.blockRate * 100).toFixed(1)}%`}
            icon={<Ban size={18} className="text-orange-400" />}
            danger={stats.blockRate > 0.2}
          />
          <StatCard
            label="IP bị blacklist"
            value={blacklist.length}
            icon={<ShieldAlert size={18} className="text-purple-400" />}
          />
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 text-center text-white/40">
          Không thể tải thống kê
        </div>
      )}

      {/* ── Top IPs ────────────────────────────────────────────────────────── */}
      {stats && stats.topIps.length > 0 && (
        <div className="glass rounded-2xl p-5 space-y-3">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-400" />
            Top IP vi phạm nhiều nhất
          </h2>
          <div className="space-y-2">
            {stats.topIps.map((item, idx) => {
              const maxCount = stats.topIps[0]?.count ?? 1
              const pct = Math.round((item.count / maxCount) * 100)
              return (
                <div key={item.ip} className="flex items-center gap-3">
                  <span className="text-white/30 text-xs w-5 text-right">{idx + 1}</span>
                  <span className="font-mono text-white/80 text-sm w-36 flex-shrink-0">{item.ip}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500/60 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-white/50 text-xs w-16 text-right">
                    {item.count.toLocaleString()} lần
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Events table ───────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        {/* Header + filter */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <ShieldAlert size={16} className="text-indigo-400" />
            Fraud Events
            <span className="text-white/30 text-sm font-normal">
              ({eventsTotal.toLocaleString()})
            </span>
          </h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyBlocked}
              onChange={e => setOnlyBlocked(e.target.checked)}
              className="accent-indigo-500"
            />
            <span className="text-white/50 text-sm">Chỉ hiện bị chặn</span>
          </label>
        </div>

        {eventsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-white/30" size={28} />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/30 space-y-2">
            <CheckCircle2 size={32} />
            <p className="text-sm">Không có fraud events nào</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    {['Thời gian', 'IP', 'Loại request', 'Risk Score', 'Trạng thái', 'Lý do chặn'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-white/40 font-medium text-xs">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">
                        {formatDate(ev.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-white/80 text-xs">{ev.ipAddress}</span>
                      </td>
                      <td className="px-4 py-3 text-white/60 text-xs">{ev.requestType}</td>
                      <td className="px-4 py-3">
                        <RiskBadge score={ev.riskScore} />
                      </td>
                      <td className="px-4 py-3">
                        {ev.blocked ? (
                          <span className="flex items-center gap-1 text-red-400 text-xs">
                            <Ban size={12} /> Bị chặn
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-400 text-xs">
                            <CheckCircle2 size={12} /> Cho qua
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/40 text-xs max-w-48 truncate">
                        {ev.blockReason ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phân trang */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/8">
              <span className="text-white/30 text-xs">
                Trang {eventsPage} / {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEventsPage(p => Math.max(1, p - 1))}
                  disabled={eventsPage === 1}
                  className="glass p-1.5 rounded-lg text-white/50 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setEventsPage(p => Math.min(totalPages, p + 1))}
                  disabled={eventsPage === totalPages}
                  className="glass p-1.5 rounded-lg text-white/50 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── IP Blacklist ───────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Ban size={16} className="text-red-400" />
            IP Blacklist
            <span className="text-white/30 text-sm font-normal">({blacklist.length})</span>
          </h2>
        </div>

        {/* Form thêm IP */}
        <div className="px-5 py-4 border-b border-white/8 space-y-3">
          <p className="text-white/50 text-xs">Thêm IP mới vào blacklist</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              value={newIp}
              onChange={e => setNewIp(e.target.value)}
              placeholder="Địa chỉ IP"
              className="glass rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/20 outline-none focus:ring-1 focus:ring-red-500/40"
            />
            <input
              type="text"
              value={newReason}
              onChange={e => setNewReason(e.target.value)}
              placeholder="Lý do (bắt buộc)"
              className="glass rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/20 outline-none focus:ring-1 focus:ring-red-500/40 md:col-span-2"
            />
            <input
              type="number"
              value={newHours}
              onChange={e => setNewHours(e.target.value)}
              placeholder="Giờ (để trống = vĩnh viễn)"
              min={1}
              className="glass rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/20 outline-none focus:ring-1 focus:ring-red-500/40"
            />
          </div>
          {addError && (
            <p className="text-red-400 text-xs flex items-center gap-1">
              <AlertTriangle size={12} /> {addError}
            </p>
          )}
          <button
            onClick={() => { void handleAddIp() }}
            disabled={addLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}
          >
            {addLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Thêm vào Blacklist
          </button>
        </div>

        {/* Danh sách blacklist */}
        {blacklistLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-white/30" size={24} />
          </div>
        ) : blacklist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-white/30 space-y-2">
            <CheckCircle2 size={28} />
            <p className="text-sm">Chưa có IP nào bị blacklist</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  {['IP', 'Lý do', 'Thêm lúc', 'Hết hạn', 'Hành động'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 font-medium text-xs">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blacklist.map(entry => (
                  <tr key={entry.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-red-300 text-xs">{entry.ipAddress}</span>
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs max-w-48 truncate">
                      {entry.reason}
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {entry.expiresAt ? (
                        <span className="text-yellow-400">{formatDate(entry.expiresAt)}</span>
                      ) : (
                        <span className="text-red-400">Vĩnh viễn</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { void handleRemoveIp(entry.ipAddress) }}
                        className="flex items-center gap-1 text-xs text-white/40 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                        Bỏ chặn
                      </button>
                    </td>
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
