'use client'

import Link from 'next/link'
import {
  ClipboardCheck, AlertTriangle, CheckCircle2, XCircle,
  RotateCcw, Clock, Loader2, RefreshCw, ArrowRight, Package, Truck
} from 'lucide-react'
import { usePendingQcOrders } from '@/hooks/queries/useFulfillmentQc'
import { useSyncShippingStatus } from '@/hooks/mutations/useSyncShippingStatus'
import { formatDate } from '@/lib/utils'
import type { QcCheckpoint, QcStatus } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const QC_STATUS_CFG: Record<QcStatus, {
  label: string
  icon: React.ReactNode
  bg: string
  border: string
  text: string
}> = {
  PENDING: {
    label: 'Chờ kiểm định',
    icon: <Clock size={13} />,
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/30',
    text: 'text-yellow-300'
  },
  PASSED: {
    label: 'Đạt QC',
    icon: <CheckCircle2 size={13} />,
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    text: 'text-emerald-300'
  },
  FAILED: {
    label: 'Không đạt',
    icon: <XCircle size={13} />,
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    text: 'text-red-300'
  },
  REWORK: {
    label: 'Làm lại',
    icon: <RotateCcw size={13} />,
    bg: 'bg-orange-500/15',
    border: 'border-orange-500/30',
    text: 'text-orange-300'
  },
}

// ─── QC Status pill ───────────────────────────────────────────────────────────

function QcStatusPill({ status }: { status: QcStatus }) {
  const cfg = QC_STATUS_CFG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ─── QC card row ──────────────────────────────────────────────────────────────

function QcRow({ qc }: { qc: QcCheckpoint }) {
  const passedCount = qc.checklist.filter(i => i.passed === true).length
  const failedCount = qc.checklist.filter(i => i.passed === false).length
  const totalCount = qc.checklist.length

  return (
    <Link
      href={`/merchant/orders/${qc.orderId}`}
      className="group flex items-center gap-4 p-4 glass rounded-xl hover:bg-white/8 transition-all border border-white/5 hover:border-white/12"
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
        <Package size={18} className="text-indigo-400" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-white text-sm font-medium font-mono">
            #{qc.orderId.slice(0, 10)}
          </p>
          <QcStatusPill status={qc.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span>Tạo lúc {formatDate(qc.createdAt)}</span>
          {totalCount > 0 && (
            <span>
              {passedCount}/{totalCount} đạt
              {failedCount > 0 && (
                <span className="text-red-400 ml-1">· {failedCount} lỗi</span>
              )}
            </span>
          )}
          {qc.inspector && (
            <span>KTV: {qc.inspector.fullName ?? qc.inspector.email}</span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <ArrowRight size={16} className="text-white/25 group-hover:text-white/60 transition-colors flex-shrink-0" />
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MerchantFulfillmentPage() {
  const { data: qcList, total, loading, error, refetch } = usePendingQcOrders(50)
  const { sync, loading: syncing } = useSyncShippingStatus()

  const pendingCount = qcList.filter(q => q.status === 'PENDING').length
  const failedCount  = qcList.filter(q => q.status === 'FAILED').length
  const passedCount  = qcList.filter(q => q.status === 'PASSED').length
  const reworkCount  = qcList.filter(q => q.status === 'REWORK').length

  const handleSync = async () => {
    await sync()
    refetch()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Kiểm định & Giao vận</h1>
          <p className="text-white/40 text-sm mt-1">Quản lý QC và tạo vận đơn cho đơn hàng</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Đồng bộ trạng thái vận chuyển từ GHN"
            className="flex items-center gap-2 px-3 py-2 glass rounded-xl text-white/60 hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
            Đồng bộ GHN
          </button>
          <button
            onClick={refetch}
            disabled={loading}
            className="p-2.5 glass rounded-xl text-white/50 hover:text-white transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Chờ QC',   value: pendingCount, color: 'text-yellow-300',  bg: 'bg-yellow-500/10' },
          { label: 'Không đạt', value: failedCount,  color: 'text-red-300',     bg: 'bg-red-500/10' },
          { label: 'Làm lại',  value: reworkCount,  color: 'text-orange-300',  bg: 'bg-orange-500/10' },
          { label: 'Đạt QC',   value: passedCount,  color: 'text-emerald-300', bg: 'bg-emerald-500/10' },
        ].map(s => (
          <div key={s.label} className={`glass rounded-xl p-4 ${s.bg} space-y-1`}>
            <p className="text-white/40 text-xs">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={16} className="text-indigo-400" />
            <h2 className="text-white font-semibold text-sm">
              Danh sách đơn cần xử lý
              {total > 0 && <span className="text-white/40 ml-2">({total})</span>}
            </h2>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="text-indigo-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="glass rounded-2xl p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 text-yellow-400" size={28} />
            <p className="text-white/60 text-sm mb-4">{error}</p>
            <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
          </div>
        )}

        {!loading && !error && qcList.length === 0 && (
          <div className="glass rounded-2xl p-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 text-emerald-400" size={36} />
            <p className="text-white font-semibold">Không có đơn nào cần xử lý</p>
            <p className="text-white/40 text-sm mt-1">Tất cả đơn hàng đã được kiểm định</p>
          </div>
        )}

        {!loading && qcList.length > 0 && (
          <div className="space-y-2">
            {/* Ưu tiên: PENDING và REWORK lên đầu, FAILED tiếp theo, PASSED cuối */}
            {[
              ...qcList.filter(q => q.status === 'PENDING' || q.status === 'REWORK'),
              ...qcList.filter(q => q.status === 'FAILED'),
              ...qcList.filter(q => q.status === 'PASSED'),
            ].map(qc => (
              <QcRow key={qc.id} qc={qc} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
