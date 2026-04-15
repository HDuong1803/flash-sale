'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Truck, AlertTriangle, CheckCircle2,
  Clock, XCircle, Loader2, RefreshCw, Shield, Wrench
} from 'lucide-react'
import { toast } from 'sonner'
import { useAdminStream } from '@/hooks/useAdminStream'
import type { AdminStreamEvent } from '@/hooks/useAdminStream'
import { adminService } from '@/services/admin.service'
import type {
  Carrier,
  FulfillmentRule,
  QcCheckpoint,
  QcStatus,
  QcChecklistItem
} from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QC_CFG: Record<QcStatus, { label: string; color: string }> = {
  PENDING: { label: 'Chờ QC',    color: 'text-yellow-400' },
  PASSED:  { label: 'Đạt QC',    color: 'text-emerald-400' },
  FAILED:  { label: 'Không đạt', color: 'text-red-400' },
  REWORK:  { label: 'Rework',    color: 'text-orange-400' },
}

const DEFAULT_QC_CHECKLIST: QcChecklistItem[] = [
  { key: 'item_count', label: 'Số lượng sản phẩm đúng', passed: null },
  { key: 'packaging', label: 'Đóng gói nguyên vẹn', passed: null },
  { key: 'label_match', label: 'Label khớp với đơn hàng', passed: null },
  { key: 'no_damage', label: 'Sản phẩm không bị hỏng hóc', passed: null },
]

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
    try {
      await onToggle(carrier.id, !carrier.active)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className={`glass rounded-xl p-4 flex items-center justify-between transition-all ${
      !carrier.active ? 'opacity-50' : ''
    }`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
          <Truck size={18} className="text-indigo-400" />
        </div>
        <div>
          <p className="text-white text-sm font-medium">{carrier.displayName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-white/40 text-xs">{carrier.code}</span>
            {carrier.sandboxMode && (
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">Sandbox</span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={`relative w-11 h-6 rounded-full transition-colors ${
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
    <div className="glass rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium truncate">{rule.name}</span>
          <span className="flex-shrink-0 px-2 py-0.5 rounded text-xs bg-indigo-500/20 text-indigo-300">
            P{rule.priority}
          </span>
          {!rule.active && (
            <span className="flex-shrink-0 px-2 py-0.5 rounded text-xs bg-white/10 text-white/40">
              Inactive
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-white/50">
          <span className="flex items-center gap-1">
            <Truck size={11} />
            {rule.carrier.displayName}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            SLA {rule.slaHours}h
          </span>
          {conditions.length > 0 && (
            <span>{conditions.join(' · ')}</span>
          )}
        </div>
      </div>
      <button
        onClick={async () => {
          setDeleting(true)
          try { await onDelete(rule.id) }
          finally { setDeleting(false) }
        }}
        disabled={deleting}
        className="flex-shrink-0 p-2 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-colors"
      >
        {deleting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
      </button>
    </div>
  )
}

function QcRow({
  qc,
  onInit,
  onPass,
  onFail,
  onRework,
  loading,
}: {
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
    <div className="glass rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          <span className="text-white/30 text-xs truncate">#{qc.orderId.slice(-8)}</span>
        </div>
        <p className="text-white/50 text-xs mt-1 truncate">
          Inspector: {qc.inspector?.fullName ?? qc.inspector?.email ?? 'Chưa nhận QC'}
        </p>
        {qc.failReason && (
          <p className="text-red-400/70 text-xs mt-0.5 truncate">{qc.failReason}</p>
        )}
      </div>
      <div className="text-right space-y-2">
        <p className="text-white/30 text-xs">
          {new Date(qc.createdAt).toLocaleDateString('vi-VN')}
        </p>
        <div className="flex items-center justify-end gap-2">
          {canInit && (
            <button
              disabled={loading}
              onClick={() => onInit(qc.orderId)}
              className="px-2.5 py-1.5 rounded-lg text-xs text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 disabled:opacity-50"
            >
              Nhận QC
            </button>
          )}
          {canPassFail && (
            <>
              <button
                disabled={loading}
                onClick={() => onPass(qc)}
                className="px-2.5 py-1.5 rounded-lg text-xs text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 disabled:opacity-50"
              >
                Đạt
              </button>
              <button
                disabled={loading}
                onClick={() => onFail(qc)}
                className="px-2.5 py-1.5 rounded-lg text-xs text-red-300 bg-red-500/15 border border-red-500/25 disabled:opacity-50"
              >
                Không đạt
              </button>
            </>
          )}
          {canRework && (
            <button
              disabled={loading}
              onClick={() => onRework(qc.orderId)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-orange-300 bg-orange-500/15 border border-orange-500/25 disabled:opacity-50"
            >
              <Wrench size={12} />
              Rework
            </button>
          )}
        </div>
      </div>
    </div>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  const refreshCooldownRef = useRef(false)

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [carriersData, rulesData, qcData] = await Promise.all([
        adminService.getCarriers(),
        adminService.getFulfillmentRules(),
        adminService.listQcCheckpoints({ status: qcFilter || undefined, limit: 30, offset: 0 }),
      ])
      setCarriers(carriersData)
      setRules(rulesData)
      setQcList(qcData.items)
      setQcTotal(qcData.total)
    } catch {
      setError('Không thể tải dữ liệu fulfillment. Kiểm tra kết nối máy chủ.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [qcFilter])

  useEffect(() => { loadData() }, [loadData])

  const handleStreamEvent = useCallback((event: AdminStreamEvent) => {
    if (event.type !== 'SLA_WARNING' && event.type !== 'SLA_BREACH') {
      return
    }

    const orderId = event.data.orderId
    if (!orderId) return

    const message = event.type === 'SLA_BREACH'
      ? `Đơn #${orderId.slice(-8)} vừa vi phạm SLA`
      : `Đơn #${orderId.slice(-8)} sắp tới hạn SLA`

    if (event.type === 'SLA_BREACH') {
      toast.error(message)
    } else {
      toast.warning(message)
    }

    if (!refreshCooldownRef.current) {
      refreshCooldownRef.current = true
      loadData(true)
      setTimeout(() => {
        refreshCooldownRef.current = false
      }, 2000)
    }
  }, [loadData])

  const streamOptions = useMemo(() => ({ onEvent: handleStreamEvent }), [handleStreamEvent])
  useAdminStream(streamOptions)

  const handleToggleCarrier = async (id: string, active: boolean) => {
    const updated = await adminService.toggleCarrier(id, active)
    setCarriers(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  const handleDeleteRule = async (id: string) => {
    await adminService.deleteFulfillmentRule(id)
    setRules(prev => prev.filter(r => r.id !== id))
  }

  const withActionLoading = async (orderId: string, action: () => Promise<void>) => {
    setActionLoading((prev) => ({ ...prev, [orderId]: true }))
    try {
      await action()
      await loadData(true)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Thao tác QC thất bại, vui lòng thử lại.'
      toast.error(message)
    } finally {
      setActionLoading((prev) => ({ ...prev, [orderId]: false }))
    }
  }

  const handleInitQc = async (orderId: string) => {
    await withActionLoading(orderId, async () => {
      await adminService.initQc(orderId)
      toast.success(`Đã nhận QC cho đơn #${orderId.slice(-8)}`)
    })
  }

  const handlePassQc = async (qc: QcCheckpoint) => {
    const checklist = (qc.checklist?.length ? qc.checklist : DEFAULT_QC_CHECKLIST).map(
      (item) => ({ ...item, passed: true })
    )

    await withActionLoading(qc.orderId, async () => {
      await adminService.passQc(qc.orderId, {
        checklist,
      })
      toast.success(`QC đạt cho đơn #${qc.orderId.slice(-8)}`)
    })
  }

  const handleFailQc = async (qc: QcCheckpoint) => {
    const sourceChecklist = qc.checklist?.length
      ? qc.checklist
      : DEFAULT_QC_CHECKLIST
    const checklist = sourceChecklist.map((item, idx) => ({
      ...item,
      passed: idx === 0 ? false : true
    }))

    await withActionLoading(qc.orderId, async () => {
      await adminService.failQc(qc.orderId, {
        checklist,
        failReason: 'Không đạt tiêu chuẩn đóng gói',
      })
      toast.warning(`QC không đạt cho đơn #${qc.orderId.slice(-8)}`)
    })
  }

  const handleReworkQc = async (orderId: string) => {
    await withActionLoading(orderId, async () => {
      await adminService.reworkQc(orderId, 'Yêu cầu xử lý lại tại kho')
      toast.success(`Đã chuyển sang rework cho đơn #${orderId.slice(-8)}`)
    })
  }

  // Stats summary
  const activeCarriers = carriers.filter(c => c.active).length
  const qcPending = qcList.filter(q => q.status === 'PENDING' || q.status === 'REWORK').length
  const qcFailed = qcList.filter(q => q.status === 'FAILED').length
  const activeRules = rules.filter(r => r.active).length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={32} className="text-indigo-400 animate-spin" />
    </div>
  )

  if (error) return (
    <div className="glass rounded-2xl p-8 text-center max-w-md mx-auto mt-12">
      <AlertTriangle className="mx-auto mb-3 text-red-400" size={32} />
      <p className="text-white/60 text-sm mb-4">{error}</p>
      <button
        onClick={() => loadData()}
        className="px-4 py-2 rounded-xl text-sm"
        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
      >
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
            Quản lý Fulfillment
          </h1>
          <p className="text-white/40 text-sm mt-1">Carriers, rules, QC station</p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 glass rounded-xl text-white/70 hover:text-white text-sm transition-all"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Carriers hoạt động"
          value={activeCarriers}
          icon={<Truck size={18} />}
          color="text-indigo-400"
        />
        <StatCard
          label="Rules đang dùng"
          value={activeRules}
          icon={<Shield size={18} />}
          color="text-violet-400"
        />
        <StatCard
          label="QC chờ kiểm tra"
          value={qcPending}
          icon={<Clock size={18} />}
          color="text-yellow-400"
        />
        <StatCard
          label="QC không đạt"
          value={qcFailed}
          icon={<AlertTriangle size={18} />}
          color="text-red-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          { key: 'qc', label: 'QC Station', icon: <CheckCircle2 size={14} /> },
          { key: 'carriers', label: 'Carriers', icon: <Truck size={14} /> },
          { key: 'rules', label: 'Rules', icon: <Shield size={14} /> },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'glass text-white/50 hover:text-white/80'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* QC Tab */}
      {tab === 'qc' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-sm">
              {qcTotal} checkpoint tổng cộng
            </p>
            <select
              value={qcFilter}
              onChange={e => setQcFilter(e.target.value as QcStatus | '')}
              className="glass rounded-xl px-3 py-2 text-white text-sm bg-transparent outline-none"
            >
              <option value="" className="bg-[#0f0a2a]">Tất cả trạng thái</option>
              <option value="PENDING" className="bg-[#0f0a2a]">Chờ QC</option>
              <option value="PASSED" className="bg-[#0f0a2a]">Đạt QC</option>
              <option value="FAILED" className="bg-[#0f0a2a]">Không đạt</option>
              <option value="REWORK" className="bg-[#0f0a2a]">Rework</option>
            </select>
          </div>

          {qcList.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 text-white/20" size={32} />
              <p className="text-white/40 text-sm">Không có QC checkpoint nào</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {qcList.map((qc) => (
                <QcRow
                  key={qc.id}
                  qc={qc}
                  loading={Boolean(actionLoading[qc.orderId])}
                  onInit={handleInitQc}
                  onPass={handlePassQc}
                  onFail={handleFailQc}
                  onRework={handleReworkQc}
                />
              ))}
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
              <p className="text-white/40 text-sm">Chưa có carrier nào được cấu hình</p>
            </div>
          ) : (
            carriers.map(carrier => (
              <CarrierCard
                key={carrier.id}
                carrier={carrier}
                onToggle={handleToggleCarrier}
              />
            ))
          )}
        </div>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-sm">
              {rules.length} rule · {activeRules} đang hoạt động
            </p>
          </div>

          {rules.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <Shield className="mx-auto mb-3 text-white/20" size={32} />
              <p className="text-white/40 text-sm">Chưa có fulfillment rule nào</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules
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
