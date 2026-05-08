'use client'

import { useState, useEffect } from 'react'
import {
  CheckCircle2, XCircle, AlertTriangle, Truck, Package,
  RotateCcw, Loader2, ExternalLink, ClipboardCheck, Tag
} from 'lucide-react'
import { toast } from 'sonner'
import type { FulfillmentOrder, QcCheckpoint, QcChecklistItem } from '@/types'
import { useQcDetail, useFulfillmentDetail } from '@/hooks/queries/useFulfillmentQc'
import { useQcActions, useBookLabel } from '@/hooks/mutations/useQcActions'

// ─── Labels ───────────────────────────────────────────────────────────────────

const FULFILL_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  AWAITING:         { label: 'Chờ QC',          color: 'text-yellow-300', bg: 'bg-yellow-500/15 border-yellow-500/30' },
  ADDRESS_ISSUE:    { label: 'Lỗi địa chỉ',      color: 'text-red-300',    bg: 'bg-red-500/15 border-red-500/30' },
  LABEL_BOOKED:     { label: 'Đã có vận đơn',    color: 'text-blue-300',   bg: 'bg-blue-500/15 border-blue-500/30' },
  PICKED:           { label: 'Đã lấy hàng',      color: 'text-indigo-300', bg: 'bg-indigo-500/15 border-indigo-500/30' },
  PACKED:           { label: 'Đã đóng gói',      color: 'text-indigo-300', bg: 'bg-indigo-500/15 border-indigo-500/30' },
  SHIPPED:          { label: 'Bàn giao GHN',     color: 'text-purple-300', bg: 'bg-purple-500/15 border-purple-500/30' },
  IN_TRANSIT:       { label: 'Đang vận chuyển',  color: 'text-violet-300', bg: 'bg-violet-500/15 border-violet-500/30' },
  OUT_FOR_DELIVERY: { label: 'Đang giao',        color: 'text-sky-300',    bg: 'bg-sky-500/15 border-sky-500/30' },
  DELIVERED:        { label: 'Đã giao',          color: 'text-emerald-300',bg: 'bg-emerald-500/15 border-emerald-500/30' },
  EXCEPTION:        { label: 'Sự cố',            color: 'text-red-300',    bg: 'bg-red-500/15 border-red-500/30' },
  CANCELLED:        { label: 'Đã huỷ',           color: 'text-white/40',   bg: 'bg-white/5 border-white/10' },
}

const QC_STATUS_CFG: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ kiểm định',  color: 'text-yellow-300' },
  PASSED:  { label: 'Đạt QC',         color: 'text-emerald-300' },
  FAILED:  { label: 'Không đạt QC',   color: 'text-red-300' },
  REWORK:  { label: 'Đang làm lại',   color: 'text-orange-300' },
}

// ─── Checklist item row ───────────────────────────────────────────────────────

function ChecklistRow({
  item,
  editable,
  onChange
}: {
  item: QcChecklistItem
  editable: boolean
  onChange?: (passed: boolean | null) => void
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="flex-1 text-sm text-white/80">{item.label}</div>
      {editable ? (
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => onChange?.(item.passed === true ? null : true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              item.passed === true
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-white/40 hover:border-emerald-500/30 hover:text-emerald-400'
            }`}
          >
            <CheckCircle2 size={13} />
            Đạt
          </button>
          <button
            type="button"
            onClick={() => onChange?.(item.passed === false ? null : false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              item.passed === false
                ? 'bg-red-500/20 border-red-500/40 text-red-300'
                : 'bg-white/5 border-white/10 text-white/40 hover:border-red-500/30 hover:text-red-400'
            }`}
          >
            <XCircle size={13} />
            Lỗi
          </button>
        </div>
      ) : (
        <div className="flex-shrink-0">
          {item.passed === true && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 size={13} /> Đạt</span>}
          {item.passed === false && <span className="flex items-center gap-1 text-xs text-red-400"><XCircle size={13} /> Lỗi</span>}
          {item.passed === null && <span className="text-xs text-white/30">—</span>}
        </div>
      )}
    </div>
  )
}

// ─── Fulfillment status pills ─────────────────────────────────────────────────

function FulfillStatusPill({ status }: { status: string }) {
  const cfg = FULFILL_STATUS_CFG[status] ?? { label: status, color: 'text-white/50', bg: 'bg-white/5 border-white/10' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

// ─── Shipping info after label booked ────────────────────────────────────────

function ShippingInfo({ fulfillment }: { fulfillment: FulfillmentOrder }) {
  if (!fulfillment.trackingNumber) return null
  return (
    <div className="mt-4 p-4 rounded-xl bg-blue-500/8 border border-blue-500/20 space-y-2">
      <div className="flex items-center gap-2 text-blue-300 text-sm font-medium">
        <Tag size={14} />
        Thông tin vận đơn
      </div>
      <div className="flex items-center justify-between">
        <span className="text-white/50 text-xs">Mã vận đơn GHN</span>
        <div className="flex items-center gap-2">
          <code className="text-white/80 text-xs font-mono bg-white/5 px-2 py-0.5 rounded">
            {fulfillment.trackingNumber}
          </code>
          {fulfillment.trackingUrl && (
            <a href={fulfillment.trackingUrl} target="_blank" rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 transition-colors">
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Book label panel ─────────────────────────────────────────────────────────

function BookLabelPanel({
  orderId,
  onSuccess
}: {
  orderId: string
  onSuccess: () => void
}) {
  const [weightGrams, setWeightGrams] = useState(500)
  const { bookLabel, loading } = useBookLabel(onSuccess)

  return (
    <div className="mt-4 p-4 rounded-xl bg-indigo-500/8 border border-indigo-500/20 space-y-3">
      <div className="flex items-center gap-2 text-indigo-300 text-sm font-medium">
        <Truck size={14} />
        Đặt vận chuyển GHN
      </div>
      <div className="flex items-center gap-3">
        <label className="text-white/50 text-xs flex-shrink-0">Trọng lượng (gram)</label>
        <input
          type="number"
          value={weightGrams}
          onChange={e => setWeightGrams(Math.max(1, parseInt(e.target.value) || 500))}
          min={1}
          max={30000}
          className="input-glass w-28 text-sm py-1.5"
        />
      </div>
      <button
        onClick={() => bookLabel(orderId, { weightGrams })}
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
        {loading ? 'Đang tạo vận đơn...' : 'Tạo vận đơn GHN'}
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FulfillmentQcCardProps {
  orderId: string
}

export function FulfillmentQcCard({ orderId }: FulfillmentQcCardProps) {
  const {
    data: fulfillment,
    loading: fulfillLoading,
    refetch: refetchFulfillment
  } = useFulfillmentDetail(orderId)

  const {
    data: qc,
    loading: qcLoading,
    refetch: refetchQc
  } = useQcDetail(orderId)

  const refresh = () => { refetchFulfillment(); refetchQc() }

  const { passQc, failQc, reworkQc, loading: actionLoading } = useQcActions(refresh)
  const [checklist, setChecklist] = useState<QcChecklistItem[]>([])
  const [note, setNote] = useState('')
  const [failReason, setFailReason] = useState('')
  const [showFailInput, setShowFailInput] = useState(false)

  // Sync checklist with QC data
  useEffect(() => {
    if (qc?.checklist?.length) {
      setChecklist(qc.checklist.map(item => ({ ...item })))
    }
  }, [qc])

  const loading = fulfillLoading || qcLoading

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <ClipboardCheck size={16} className="text-indigo-400" />
          <h3 className="text-white font-semibold text-sm">Kiểm định & Giao vận</h3>
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="h-8 rounded-lg bg-white/5" />
          <div className="h-8 rounded-lg bg-white/5" />
          <div className="h-8 rounded-lg bg-white/5" />
        </div>
      </div>
    )
  }

  if (!fulfillment && !qc) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <ClipboardCheck size={16} className="text-indigo-400" />
          <h3 className="text-white font-semibold text-sm">Kiểm định & Giao vận</h3>
        </div>
        <p className="text-white/35 text-sm">
          Chưa có thông tin fulfillment — đơn hàng chưa được xác nhận thanh toán.
        </p>
      </div>
    )
  }

  const fulfillStatus = fulfillment?.fulfillStatus
  const qcStatus = qc?.status
  const isQcEditable = qcStatus === 'PENDING' || qcStatus === 'REWORK'
  const allChecked = checklist.every(item => item.passed !== null)
  const anyFailed = checklist.some(item => item.passed === false)
  const canBookLabel = fulfillStatus === 'AWAITING' && qcStatus === 'PASSED'
  const labelBooked = fulfillStatus !== 'AWAITING' && fulfillStatus !== 'ADDRESS_ISSUE'

  const handleItemChange = (key: string, passed: boolean | null) => {
    setChecklist(prev => prev.map(item => item.key === key ? { ...item, passed } : item))
  }

  const handlePass = async () => {
    if (!allChecked) {
      toast.warning('Vui lòng tick đầy đủ tất cả hạng mục trước khi xác nhận')
      return
    }
    if (anyFailed) {
      toast.warning('Có hạng mục bị lỗi — hãy dùng "Không đạt QC"')
      return
    }
    await passQc(orderId, { checklist, notes: note || undefined })
    setNote('')
  }

  const handleFail = async () => {
    if (!failReason.trim()) {
      toast.warning('Vui lòng nhập lý do không đạt')
      return
    }
    await failQc(orderId, { checklist, failReason: failReason.trim(), notes: note || undefined })
    setNote('')
    setFailReason('')
    setShowFailInput(false)
  }

  const handleRework = async () => {
    await reworkQc(orderId, note || undefined)
    setNote('')
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={15} className="text-indigo-400" />
          <h3 className="text-white font-semibold text-sm">Kiểm định & Giao vận</h3>
        </div>
        <div className="flex items-center gap-2">
          {fulfillStatus && <FulfillStatusPill status={fulfillStatus} />}
          {qcStatus && (
            <span className={`text-xs font-medium ${QC_STATUS_CFG[qcStatus]?.color ?? 'text-white/50'}`}>
              {QC_STATUS_CFG[qcStatus]?.label}
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Address issue warning */}
        {fulfillStatus === 'ADDRESS_ISSUE' && (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 text-sm font-medium">Địa chỉ giao hàng không hợp lệ</p>
              <p className="text-white/50 text-xs mt-0.5">
                Liên hệ khách hàng để xác nhận lại địa chỉ trước khi tiếp tục.
              </p>
            </div>
          </div>
        )}

        {/* QC Checklist */}
        {qc && checklist.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Checklist kiểm định</p>
            {checklist.map(item => (
              <ChecklistRow
                key={item.key}
                item={item}
                editable={isQcEditable}
                onChange={passed => handleItemChange(item.key, passed)}
              />
            ))}
          </div>
        )}

        {/* QC pass info */}
        {qcStatus === 'PASSED' && qc?.passedAt && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-300 text-sm">
              Đạt QC lúc{' '}
              {new Date(qc.passedAt).toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>
        )}

        {/* QC fail info */}
        {qcStatus === 'FAILED' && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1">
            <div className="flex items-center gap-2">
              <XCircle size={15} className="text-red-400" />
              <p className="text-red-300 text-sm font-medium">Không đạt QC</p>
            </div>
            {qc?.failReason && (
              <p className="text-white/50 text-xs pl-5">{qc.failReason}</p>
            )}
          </div>
        )}

        {/* Notes input */}
        {isQcEditable && (
          <div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ghi chú kiểm định (tuỳ chọn)..."
              rows={2}
              className="input-glass w-full text-sm resize-none"
            />
          </div>
        )}

        {/* Fail reason input */}
        {showFailInput && (
          <div className="space-y-2">
            <input
              value={failReason}
              onChange={e => setFailReason(e.target.value)}
              placeholder="Lý do không đạt QC *"
              className="input-glass w-full text-sm"
            />
          </div>
        )}

        {/* Action buttons */}
        {isQcEditable && !showFailInput && (
          <div className="flex gap-2">
            <button
              onClick={handlePass}
              disabled={actionLoading || !allChecked || anyFailed}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Đạt QC
            </button>
            <button
              onClick={() => setShowFailInput(true)}
              disabled={actionLoading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 disabled:opacity-40 transition-all"
            >
              <XCircle size={14} />
              Không đạt
            </button>
          </div>
        )}

        {/* Confirm fail */}
        {showFailInput && (
          <div className="flex gap-2">
            <button
              onClick={handleFail}
              disabled={actionLoading || !failReason.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 disabled:opacity-40 transition-all"
            >
              {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              Xác nhận không đạt
            </button>
            <button
              onClick={() => setShowFailInput(false)}
              className="px-4 py-2.5 rounded-xl text-sm text-white/50 glass hover:text-white transition-colors"
            >
              Huỷ
            </button>
          </div>
        )}

        {/* Rework button */}
        {qcStatus === 'FAILED' && (
          <button
            onClick={handleRework}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/25 disabled:opacity-40 transition-all"
          >
            <RotateCcw size={14} />
            Yêu cầu làm lại QC
          </button>
        )}

        {/* Book GHN label */}
        {canBookLabel && (
          <BookLabelPanel orderId={orderId} onSuccess={refresh} />
        )}

        {/* Tracking info after label booked */}
        {labelBooked && fulfillment && (
          <ShippingInfo fulfillment={fulfillment} />
        )}

        {/* SLA warning */}
        {fulfillment?.slaBreached && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/15">
            <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-xs">
              Đơn hàng đã quá hạn SLA —{' '}
              {fulfillment.slaDeadline && new Date(fulfillment.slaDeadline).toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
