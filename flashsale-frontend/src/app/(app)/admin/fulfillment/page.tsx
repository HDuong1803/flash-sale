'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Truck, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2, RefreshCw,
  Shield, Wrench, Search, Plus, ChevronLeft, ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { useAdminStream } from '@/hooks/useAdminStream'
import type { AdminStreamEvent } from '@/hooks/useAdminStream'
import { adminService } from '@/services/admin.service'
import type { Carrier, FulfillmentRule, QcCheckpoint, QcStatus, QcChecklistItem } from '@/types'

const QC_CFG: Record<QcStatus, { label: string; color: string }> = {
  PENDING: { label: 'Chờ QC',    color: 'text-yellow-400' },
  PASSED:  { label: 'Đạt QC',    color: 'text-emerald-400' },
  FAILED:  { label: 'Không đạt', color: 'text-red-400' },
  REWORK:  { label: 'Làm lại',   color: 'text-orange-400' },
}

const DEFAULT_QC_CHECKLIST: QcChecklistItem[] = [
  { key: 'item_count', label: 'Số lượng sản phẩm đúng', passed: null },
  { key: 'packaging', label: 'Đóng gói nguyên vẹn', passed: null },
  { key: 'label_match', label: 'Label khớp với đơn hàng', passed: null },
  { key: 'no_damage', label: 'Sản phẩm không bị hỏng hóc', passed: null },
]

const QC_PAGE_SIZE = 15

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: {
  label: string; value: string | number; icon: React.ReactNode; color: string
}) {
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-sm">{label}</p>
        <div className={color}>{icon}</div>
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  )
}

function CarrierCard({ carrier, onToggle }: {
  carrier: Carrier
  onToggle: (id: string, active: boolean) => void
}) {
  const [toggling, setToggling] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    try { await onToggle(carrier.id, !carrier.active) }
    finally { setToggling(false) }
  }

  return (
    <div className={`glass rounded-xl p-4 transition-all ${!carrier.active ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <Truck size={18} className="text-indigo-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white text-sm font-semibold">{carrier.displayName}</p>
              {carrier.sandboxMode && (
                <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                  Thử nghiệm
                </span>
              )}
              {carrier.active ? (
                <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  Hoạt động
                </span>
              ) : (
                <span className="text-xs bg-white/5 text-white/40 border border-white/10 px-2 py-0.5 rounded-full">
                  Tắt
                </span>
              )}
            </div>
            <p className="text-white/40 text-xs mt-0.5 font-mono">{carrier.code}</p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={toggling}
          aria-label={carrier.active ? 'Tắt đơn vị vận chuyển' : 'Bật đơn vị vận chuyển'}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
            carrier.active ? 'bg-indigo-600' : 'bg-white/15'
          }`}
        >
          {toggling ? (
            <Loader2 size={12} className="absolute inset-0 m-auto text-white animate-spin" />
          ) : (
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              carrier.active ? 'translate-x-6' : 'translate-x-1'
            }`} />
          )}
        </button>
      </div>
    </div>
  )
}

function QcRow({ qc, onInit, onPass, onFail, onRework, loading }: {
  qc: QcCheckpoint
  onInit: (orderId: string) => Promise<void>
  onPass: (qc: QcCheckpoint) => Promise<void>
  onFail: (qc: QcCheckpoint) => Promise<void>
  onRework: (orderId: string) => Promise<void>
  loading: boolean
}) {
  const cfg = QC_CFG[qc.status]
  const canInit = !qc.inspector
  const canPassFail = qc.status === 'PENDING' || qc.status === 'REWORK'
  const canRework = qc.status === 'FAILED'

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-white/5 ${cfg.color}`}>
              {cfg.label}
            </span>
            <span className="text-white/50 text-xs font-mono">#{qc.orderId.slice(-12)}</span>
          </div>
          <p className="text-white/40 text-xs mt-1.5">
            Kiểm soát viên: {qc.inspector?.fullName ?? qc.inspector?.email ?? 'Chưa nhận QC'}
          </p>
          {qc.failReason && (
            <p className="text-red-400/70 text-xs mt-0.5 truncate">{qc.failReason}</p>
          )}
        </div>
        <div className="flex-shrink-0 space-y-2">
          <p className="text-white/30 text-xs text-right">
            {new Date(qc.createdAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
          </p>
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            {canInit && (
              <button
                disabled={loading}
                onClick={() => onInit(qc.orderId)}
                className="px-2.5 py-1 rounded-lg text-xs text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 hover:bg-indigo-500/25 disabled:opacity-50 transition-colors"
              >
                Nhận QC
              </button>
            )}
            {canPassFail && (
              <>
                <button
                  disabled={loading}
                  onClick={() => onPass(qc)}
                  className="px-2.5 py-1 rounded-lg text-xs text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                >
                  Đạt
                </button>
                <button
                  disabled={loading}
                  onClick={() => onFail(qc)}
                  className="px-2.5 py-1 rounded-lg text-xs text-red-300 bg-red-500/15 border border-red-500/25 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
                >
                  Không đạt
                </button>
              </>
            )}
            {canRework && (
              <button
                disabled={loading}
                onClick={() => onRework(qc.orderId)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-orange-300 bg-orange-500/15 border border-orange-500/25 hover:bg-orange-500/25 disabled:opacity-50 transition-colors"
              >
                <Wrench size={11} />
                Làm lại
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function RuleRow({ rule, onDelete }: {
  rule: FulfillmentRule
  onDelete: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)

  const conditions: string[] = []
  if (rule.minWeightGrams != null) conditions.push(`≥${rule.minWeightGrams}g`)
  if (rule.maxWeightGrams != null) conditions.push(`≤${rule.maxWeightGrams}g`)
  if (rule.destCountry) conditions.push(rule.destCountry)
  if (rule.destState) conditions.push(rule.destState)

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-medium truncate">{rule.name}</span>
            <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              P{rule.priority}
            </span>
            {!rule.active && (
              <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs bg-white/5 text-white/40 border border-white/10">
                Tạm tắt
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40 flex-wrap">
            <span className="flex items-center gap-1">
              <Truck size={11} />
              {rule.carrier.displayName}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              SLA {rule.slaHours}h
            </span>
            {conditions.length > 0 && <span>{conditions.join(' · ')}</span>}
          </div>
        </div>
        <button
          onClick={async () => {
            setDeleting(true)
            try { await onDelete(rule.id) }
            finally { setDeleting(false) }
          }}
          disabled={deleting}
          aria-label="Xóa quy tắc"
          className="flex-shrink-0 p-2 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-colors"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
        </button>
      </div>
    </div>
  )
}

// ─── Create Rule Form ─────────────────────────────────────────────────────────

interface CreateRuleFormData {
  name: string
  priority: string
  carrierId: string
  slaHours: string
  minWeightGrams: string
  maxWeightGrams: string
  destCountry: string
  destState: string
}

const EMPTY_FORM: CreateRuleFormData = {
  name: '', priority: '10', carrierId: '', slaHours: '48',
  minWeightGrams: '', maxWeightGrams: '', destCountry: '', destState: '',
}

function CreateRuleForm({ carriers, onSubmit, onCancel }: {
  carriers: Carrier[]
  onSubmit: (data: CreateRuleFormData) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<CreateRuleFormData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const set = (field: keyof CreateRuleFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.carrierId) {
      toast.error('Vui lòng điền đầy đủ tên quy tắc và chọn đơn vị vận chuyển')
      return
    }
    setSubmitting(true)
    try { await onSubmit(form) }
    finally { setSubmitting(false) }
  }

  const inputCls = 'w-full glass rounded-xl px-3 py-2.5 text-white text-sm bg-transparent outline-none border border-white/10 focus:border-indigo-500/50 transition-colors'

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-5 space-y-4 border border-indigo-500/20">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">Tạo quy tắc mới</h3>
        <button type="button" onClick={onCancel} className="text-white/40 hover:text-white/70 transition-colors">
          <XCircle size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-white/50 text-xs block mb-1.5">Tên quy tắc *</label>
          <input type="text" value={form.name} onChange={set('name')}
            placeholder="VD: Hàng nặng toàn quốc" required className={inputCls} />
        </div>
        <div>
          <label className="text-white/50 text-xs block mb-1.5">Đơn vị vận chuyển *</label>
          <select value={form.carrierId} onChange={set('carrierId')} required
            className="w-full glass rounded-xl px-3 py-2.5 text-white text-sm bg-[#0f0a2a] outline-none border border-white/10">
            <option value="">Chọn đơn vị vận chuyển</option>
            {carriers.filter(c => c.active).map(c => (
              <option key={c.id} value={c.id}>{c.displayName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-white/50 text-xs block mb-1.5">Ưu tiên</label>
          <input type="number" value={form.priority} onChange={set('priority')} min="1" max="100" className={inputCls} />
        </div>
        <div>
          <label className="text-white/50 text-xs block mb-1.5">SLA (giờ)</label>
          <input type="number" value={form.slaHours} onChange={set('slaHours')} min="1" className={inputCls} />
        </div>
        <div>
          <label className="text-white/50 text-xs block mb-1.5">Cân nặng tối thiểu (g)</label>
          <input type="number" value={form.minWeightGrams} onChange={set('minWeightGrams')}
            placeholder="Không giới hạn" min="0" className={inputCls} />
        </div>
        <div>
          <label className="text-white/50 text-xs block mb-1.5">Cân nặng tối đa (g)</label>
          <input type="number" value={form.maxWeightGrams} onChange={set('maxWeightGrams')}
            placeholder="Không giới hạn" min="0" className={inputCls} />
        </div>
        <div>
          <label className="text-white/50 text-xs block mb-1.5">Quốc gia đích</label>
          <input type="text" value={form.destCountry} onChange={set('destCountry')}
            placeholder="VD: VN" className={inputCls} />
        </div>
        <div>
          <label className="text-white/50 text-xs block mb-1.5">Tỉnh/Thành phố đích</label>
          <input type="text" value={form.destState} onChange={set('destState')}
            placeholder="VD: Hà Nội" className={inputCls} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 glass rounded-xl text-white/60 hover:text-white text-sm transition-colors">
          Hủy
        </button>
        <button type="submit" disabled={submitting}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}>
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {submitting ? 'Đang tạo...' : 'Tạo quy tắc'}
        </button>
      </div>
    </form>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'qc' | 'carriers' | 'rules'

export default function AdminFulfillmentPage() {
  const [tab, setTab] = useState<Tab>('qc')
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [rules, setRules] = useState<FulfillmentRule[]>([])
  const [qcList, setQcList] = useState<QcCheckpoint[]>([])
  const [qcTotal, setQcTotal] = useState(0)
  const [qcFilter, setQcFilter] = useState<QcStatus | ''>('')
  const [qcPage, setQcPage] = useState(0)
  const [qcSearch, setQcSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [showCreateRule, setShowCreateRule] = useState(false)

  const refreshCooldownRef = useRef(false)

  const loadQc = useCallback(async (page: number, filter: QcStatus | '') => {
    const data = await adminService.listQcCheckpoints({
      status: filter || undefined,
      limit: QC_PAGE_SIZE,
      offset: page * QC_PAGE_SIZE,
    })
    setQcList(data.items)
    setQcTotal(data.total)
  }, [])

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [carriersData, rulesData] = await Promise.all([
        adminService.getCarriers(),
        adminService.getFulfillmentRules(),
      ])
      setCarriers(carriersData)
      setRules(rulesData)
      await loadQc(0, '')
      setQcPage(0)
      setQcFilter('')
    } catch {
      setError('Không thể tải dữ liệu vận hành. Kiểm tra kết nối máy chủ.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [loadQc])

  useEffect(() => { loadAll() }, [loadAll])

  const handleFilterChange = useCallback(async (filter: QcStatus | '') => {
    setQcFilter(filter)
    setQcPage(0)
    setQcSearch('')
    try { await loadQc(0, filter) } catch { /* ignore */ }
  }, [loadQc])

  const handlePageChange = useCallback(async (newPage: number) => {
    setQcPage(newPage)
    try { await loadQc(newPage, qcFilter) } catch { /* ignore */ }
  }, [qcFilter, loadQc])

  const handleStreamEvent = useCallback((event: AdminStreamEvent) => {
    if (event.type !== 'SLA_WARNING' && event.type !== 'SLA_BREACH') return
    const orderId = event.data.orderId
    if (!orderId) return
    const msg = event.type === 'SLA_BREACH'
      ? `Đơn #${orderId.slice(-8)} vừa vi phạm SLA`
      : `Đơn #${orderId.slice(-8)} sắp tới hạn SLA`
    if (event.type === 'SLA_BREACH') toast.error(msg)
    else toast.warning(msg)
    if (!refreshCooldownRef.current) {
      refreshCooldownRef.current = true
      loadAll(true)
      setTimeout(() => { refreshCooldownRef.current = false }, 2000)
    }
  }, [loadAll])

  const streamOptions = useMemo(() => ({ onEvent: handleStreamEvent }), [handleStreamEvent])
  useAdminStream(streamOptions)

  const handleToggleCarrier = async (id: string, active: boolean) => {
    try {
      const updated = await adminService.toggleCarrier(id, active)
      setCarriers(prev => prev.map(c => c.id === updated.id ? updated : c))
      toast.success(`Đơn vị vận chuyển ${active ? 'đã bật' : 'đã tắt'}`)
    } catch {
      toast.error('Không thể cập nhật đơn vị vận chuyển')
    }
  }

  const handleDeleteRule = async (id: string) => {
    await adminService.deleteFulfillmentRule(id)
    setRules(prev => prev.filter(r => r.id !== id))
    toast.success('Đã xóa quy tắc')
  }

  const handleCreateRule = async (formData: CreateRuleFormData) => {
    const newRule = await adminService.createFulfillmentRule({
      name: formData.name.trim(),
      priority: Number(formData.priority),
      carrierId: formData.carrierId,
      slaHours: Number(formData.slaHours),
      minWeightGrams: formData.minWeightGrams ? Number(formData.minWeightGrams) : undefined,
      maxWeightGrams: formData.maxWeightGrams ? Number(formData.maxWeightGrams) : undefined,
      destCountry: formData.destCountry.trim() || undefined,
      destState: formData.destState.trim() || undefined,
    })
    setRules(prev => [...prev, newRule])
    setShowCreateRule(false)
    toast.success(`Đã tạo quy tắc "${newRule.name}"`)
  }

  const withQcAction = async (orderId: string, action: () => Promise<void>) => {
    setActionLoading(prev => ({ ...prev, [orderId]: true }))
    try {
      await action()
      await loadQc(qcPage, qcFilter)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Thao tác thất bại')
    } finally {
      setActionLoading(prev => ({ ...prev, [orderId]: false }))
    }
  }

  const handleInitQc = async (orderId: string) =>
    withQcAction(orderId, async () => {
      await adminService.initQc(orderId)
      toast.success(`Đã nhận QC cho đơn #${orderId.slice(-8)}`)
    })

  const handlePassQc = async (qc: QcCheckpoint) => {
    const checklist = (qc.checklist?.length ? qc.checklist : DEFAULT_QC_CHECKLIST)
      .map(item => ({ ...item, passed: true }))
    return withQcAction(qc.orderId, async () => {
      await adminService.passQc(qc.orderId, { checklist })
      toast.success(`QC đạt cho đơn #${qc.orderId.slice(-8)}`)
    })
  }

  const handleFailQc = async (qc: QcCheckpoint) => {
    const src = qc.checklist?.length ? qc.checklist : DEFAULT_QC_CHECKLIST
    const checklist = src.map((item, idx) => ({ ...item, passed: idx !== 0 }))
    return withQcAction(qc.orderId, async () => {
      await adminService.failQc(qc.orderId, { checklist, failReason: 'Không đạt tiêu chuẩn đóng gói' })
      toast.warning(`QC không đạt cho đơn #${qc.orderId.slice(-8)}`)
    })
  }

  const handleReworkQc = async (orderId: string) =>
    withQcAction(orderId, async () => {
      await adminService.reworkQc(orderId, 'Yêu cầu xử lý lại tại kho')
      toast.success(`Đã chuyển sang làm lại cho đơn #${orderId.slice(-8)}`)
    })

  const filteredQcList = useMemo(() => {
    if (!qcSearch.trim()) return qcList
    const q = qcSearch.toLowerCase()
    return qcList.filter(qc => qc.orderId.toLowerCase().includes(q))
  }, [qcList, qcSearch])

  const activeCarriers = carriers.filter(c => c.active).length
  const activeRules = rules.filter(r => r.active).length
  const totalPages = Math.ceil(qcTotal / QC_PAGE_SIZE)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={32} className="text-indigo-400 animate-spin" />
    </div>
  )

  if (error) return (
    <div className="glass rounded-2xl p-8 text-center max-w-md mx-auto mt-12">
      <AlertTriangle className="mx-auto mb-3 text-red-400" size={32} />
      <p className="text-white/60 text-sm mb-4">{error}</p>
      <button onClick={() => loadAll()} className="px-4 py-2 rounded-xl text-sm text-white"
        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
        Thử lại
      </button>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">
            Vận hành & Kiểm soát chất lượng
          </h1>
          <p className="text-white/40 text-sm mt-1">Đơn vị vận chuyển, quy tắc định tuyến và kiểm soát chất lượng</p>
        </div>
        <button onClick={() => loadAll(true)} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 glass rounded-xl text-white/70 hover:text-white text-sm transition-all">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Đơn vị vận chuyển" value={activeCarriers}
          icon={<Truck size={18} />} color="text-indigo-400" />
        <StatCard label="Quy tắc đang dùng" value={activeRules}
          icon={<Shield size={18} />} color="text-violet-400" />
        <StatCard label="Điểm kiểm soát" value={qcTotal}
          icon={<Clock size={18} />} color="text-yellow-400" />
        <StatCard label="Tổng quy tắc" value={rules.length}
          icon={<CheckCircle2 size={18} />} color="text-emerald-400" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'qc', label: 'Kiểm soát chất lượng', icon: <CheckCircle2 size={14} /> },
          { key: 'carriers', label: 'Đơn vị vận chuyển', icon: <Truck size={14} /> },
          { key: 'rules', label: 'Quy tắc', icon: <Shield size={14} /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'glass text-white/50 hover:text-white/80'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* QC Station Tab */}
      {tab === 'qc' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <p className="text-white/40 text-sm">{qcTotal} điểm kiểm soát</p>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Tìm theo mã đơn hàng..."
                  value={qcSearch}
                  onChange={e => setQcSearch(e.target.value)}
                  className="glass rounded-xl pl-9 pr-3 py-2 text-white text-sm bg-transparent outline-none border border-white/10 w-52"
                />
              </div>
              <select
                value={qcFilter}
                onChange={e => handleFilterChange(e.target.value as QcStatus | '')}
                className="glass rounded-xl px-3 py-2 text-white text-sm bg-[#0f0a2a] outline-none border border-white/10"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="PENDING">Chờ QC</option>
                <option value="PASSED">Đạt QC</option>
                <option value="FAILED">Không đạt</option>
                <option value="REWORK">Làm lại</option>
              </select>
            </div>
          </div>

          {filteredQcList.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 text-white/20" size={32} />
              <p className="text-white/40 text-sm">Không có điểm kiểm soát nào</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredQcList.map(qc => (
                <QcRow
                  key={qc.id} qc={qc} loading={Boolean(actionLoading[qc.orderId])}
                  onInit={handleInitQc} onPass={handlePassQc}
                  onFail={handleFailQc} onRework={handleReworkQc}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-white/40 text-sm">Trang {qcPage + 1} / {totalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(qcPage - 1)}
                  disabled={qcPage === 0}
                  className="flex items-center gap-1.5 px-3 py-2 glass rounded-xl text-white/60 hover:text-white text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />Trước
                </button>
                <button
                  onClick={() => handlePageChange(qcPage + 1)}
                  disabled={qcPage >= totalPages - 1}
                  className="flex items-center gap-1.5 px-3 py-2 glass rounded-xl text-white/60 hover:text-white text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Tiếp<ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Carriers Tab */}
      {tab === 'carriers' && (
        <div className="space-y-3">
          {carriers.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <Truck className="mx-auto mb-3 text-white/20" size={32} />
              <p className="text-white/40 text-sm">Chưa có đơn vị vận chuyển nào được cấu hình</p>
            </div>
          ) : (
            carriers.map(carrier => (
              <CarrierCard key={carrier.id} carrier={carrier} onToggle={handleToggleCarrier} />
            ))
          )}
        </div>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-white/40 text-sm">{rules.length} quy tắc · {activeRules} đang hoạt động</p>
            {!showCreateRule && (
              <button
                onClick={() => setShowCreateRule(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 4px 15px rgba(99,102,241,0.3)' }}
              >
                <Plus size={14} />Tạo quy tắc mới
              </button>
            )}
          </div>

          {showCreateRule && (
            <CreateRuleForm
              carriers={carriers}
              onSubmit={handleCreateRule}
              onCancel={() => setShowCreateRule(false)}
            />
          )}

          {rules.length === 0 && !showCreateRule ? (
            <div className="glass rounded-2xl p-12 text-center">
              <Shield className="mx-auto mb-3 text-white/20" size={32} />
              <p className="text-white/40 text-sm">Chưa có quy tắc vận hành nào</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...rules]
                .sort((a, b) => b.priority - a.priority)
                .map(rule => (
                  <RuleRow key={rule.id} rule={rule} onDelete={handleDeleteRule} />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
