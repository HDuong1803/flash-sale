'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Package, Truck, CheckCircle2, AlertTriangle,
  MapPin, Clock, Loader2, ChevronLeft, ExternalLink,
  RefreshCw, XCircle, PartyPopper
} from 'lucide-react'
import { toast } from 'sonner'
import { orderService } from '@/services/order.service'
import { useAuthContext } from '@/contexts/auth-context'
import type { FulfillmentOrder, FulfillmentStatus, TrackingEvent } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS: Array<{
  key: FulfillmentStatus
  label: string
  icon: React.ReactNode
}> = [
  { key: 'AWAITING',         label: 'Chờ xử lý đơn',    icon: <Package size={16} /> },
  { key: 'LABEL_BOOKED',     label: 'Đã in nhãn',        icon: <CheckCircle2 size={16} /> },
  { key: 'PICKED',           label: 'Đã lấy hàng',       icon: <Truck size={16} /> },
  { key: 'PACKED',           label: 'Đã đóng gói',       icon: <Package size={16} /> },
  { key: 'SHIPPED',          label: 'Đã bàn giao hãng vận chuyển', icon: <Truck size={16} /> },
  { key: 'IN_TRANSIT',       label: 'Đang vận chuyển',    icon: <Truck size={16} /> },
  { key: 'OUT_FOR_DELIVERY', label: 'Đang giao đến bạn', icon: <MapPin size={16} /> },
  { key: 'DELIVERED',        label: 'Đã giao thành công', icon: <CheckCircle2 size={16} /> },
]

const STATUS_ORDER: FulfillmentStatus[] = [
  'AWAITING',
  'LABEL_BOOKED',
  'PICKED',
  'PACKED',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED'
]

const STATUS_LABELS: Partial<Record<FulfillmentStatus, string>> = {
  AWAITING:           'Chờ xử lý đơn hàng',
  ADDRESS_ISSUE:      'Địa chỉ giao hàng có vấn đề',
  LABEL_BOOKED:       'Đã in nhãn vận chuyển',
  PICKED:             'Đã lấy hàng khỏi kho',
  PACKED:             'Đã đóng gói',
  SHIPPED:            'Đã bàn giao đơn vị vận chuyển',
  IN_TRANSIT:         'Đang trên đường vận chuyển',
  OUT_FOR_DELIVERY:   'Đang giao đến địa chỉ của bạn',
  DELIVERED:          'Đã giao hàng thành công',
  EXCEPTION:          'Có sự cố trong quá trình vận chuyển',
  CANCELLED:          'Đơn hàng đã bị huỷ',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStepIndex(status: FulfillmentStatus): number {
  return STATUS_ORDER.indexOf(status)
}

function isTerminal(status: FulfillmentStatus): boolean {
  return ['DELIVERED', 'CANCELLED', 'EXCEPTION'].includes(status)
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'vừa xong'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ trước`
  return new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh',  day: '2-digit', month: '2-digit' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressStepper({ status }: { status: FulfillmentStatus }) {
  const currentIdx = getStepIndex(status)
  const isExceptional = ['EXCEPTION', 'CANCELLED', 'ADDRESS_ISSUE'].includes(status)

  if (isExceptional) {
    return (
      <div className="glass rounded-2xl p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
          <XCircle size={24} className="text-red-400" />
        </div>
        <div>
          <p className="text-red-400 font-semibold">{STATUS_LABELS[status]}</p>
          <p className="text-white/40 text-sm mt-0.5">
            Vui lòng liên hệ hỗ trợ để được giải quyết
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="relative">
        {/* Progress track */}
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-white/10 -z-0" />
        <div
          className="absolute top-5 left-5 h-0.5 bg-indigo-500 transition-all duration-700 -z-0"
          style={{
            width: `${Math.min(currentIdx / (STEPS.length - 1), 1) * (100 - (40 / (STEPS.length - 1 + 0.01)))}%`
          }}
        />

        {/* Steps */}
        <div className="relative flex justify-between">
          {STEPS.map((step, idx) => {
            const done = idx < currentIdx
            const active = idx === currentIdx

            return (
              <div key={step.key} className="flex flex-col items-center gap-2 w-16">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                  done
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : active
                    ? 'bg-indigo-600/30 border-indigo-400 text-indigo-300 ring-4 ring-indigo-500/20'
                    : 'bg-white/5 border-white/15 text-white/25'
                }`}>
                  {done ? <CheckCircle2 size={16} /> : step.icon}
                </div>
                <p className={`text-center text-xs leading-tight ${
                  active ? 'text-indigo-300 font-medium' : done ? 'text-white/50' : 'text-white/25'
                }`}>
                  {step.label}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CarrierCard({ fulfillment }: { fulfillment: FulfillmentOrder }) {
  if (!fulfillment.carrier && !fulfillment.trackingNumber) return null

  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <h3 className="text-white/60 text-xs uppercase tracking-widest">Thông tin vận chuyển</h3>
      <div className="space-y-2.5">
        {fulfillment.carrier && (
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-sm">Đơn vị vận chuyển</span>
            <div className="flex items-center gap-2">
              <Truck size={14} className="text-indigo-400" />
              <span className="text-white text-sm font-medium">{fulfillment.carrier.displayName}</span>
            </div>
          </div>
        )}
        {fulfillment.trackingNumber && (
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-sm">Mã tracking</span>
            <div className="flex items-center gap-2">
              <code className="text-white/80 text-xs font-mono bg-white/5 px-2 py-0.5 rounded">
                {fulfillment.trackingNumber}
              </code>
              {fulfillment.trackingUrl && (
                <a
                  href={fulfillment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        )}
        {fulfillment.slaDeadline && (
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-sm">Giao trước</span>
            <div className="flex items-center gap-1.5">
              <Clock size={13} className={fulfillment.slaBreached ? 'text-red-400' : 'text-emerald-400'} />
              <span className={`text-sm ${fulfillment.slaBreached ? 'text-red-400' : 'text-white/80'}`}>
                {new Date(fulfillment.slaDeadline).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', 
                  day: '2-digit', month: '2-digit', year: 'numeric'
                })}
              </span>
              {fulfillment.slaBreached && (
                <span className="text-xs text-red-400">(Trễ hạn)</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TrackingTimeline({ events }: { events: TrackingEvent[] }) {
  if (events.length === 0) return null

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <h3 className="text-white/60 text-xs uppercase tracking-widest">Lịch sử vận chuyển</h3>
      <div className="space-y-0">
        {events.map((event, idx) => (
          <div key={event.id} className="flex gap-4">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${
                idx === 0 ? 'bg-indigo-500' : 'bg-white/20'
              }`} />
              {idx < events.length - 1 && (
                <div className="w-px flex-1 bg-white/10 my-1 min-h-[24px]" />
              )}
            </div>

            {/* Content */}
            <div className={`pb-4 ${idx === events.length - 1 ? 'pb-0' : ''}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-sm font-medium ${idx === 0 ? 'text-white' : 'text-white/60'}`}>
                  {event.description ?? event.carrierStatus}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/30">
                {event.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={10} />
                    {event.location}
                  </span>
                )}
                <span>{formatTimeAgo(event.occurredAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrderTrackingPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string

  const { user } = useAuthContext()
  const isCustomer = user?.role === 'CUSTOMER'

  const [fulfillment, setFulfillment] = useState<FulfillmentOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await orderService.getFulfillmentTracking(orderId)
      setFulfillment(data)
    } catch {
      setError('Không thể tải thông tin vận chuyển')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [orderId])

  useEffect(() => { load() }, [load])

  // Auto-refresh mỗi 2 phút nếu chưa delivered
  useEffect(() => {
    if (!fulfillment || isTerminal(fulfillment.fulfillStatus)) return
    const timer = setInterval(() => load(true), 120_000)
    return () => clearInterval(timer)
  }, [fulfillment, load])

  const handleConfirmDelivery = useCallback(async () => {
    setConfirming(true)
    try {
      await orderService.confirmDelivery(orderId)
      toast.success('Xác nhận nhận hàng thành công! Đơn hàng đã hoàn thành.')
      router.push(`/orders/${orderId}`)
    } catch {
      toast.error('Không thể xác nhận lúc này, vui lòng thử lại')
    } finally {
      setConfirming(false)
    }
  }, [orderId, router])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={32} className="text-indigo-400 animate-spin" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-8">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/orders/${orderId}`)}
          className="p-2 glass rounded-xl text-white/50 hover:text-white transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Theo dõi đơn hàng</h1>
          <p className="text-white/40 text-xs mt-0.5 font-mono">#{orderId.slice(-12)}</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="p-2 glass rounded-xl text-white/50 hover:text-white transition-colors"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="glass rounded-2xl p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 text-yellow-400" size={28} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button
            onClick={() => load()}
            className="px-4 py-2 rounded-xl text-sm"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
          >
            Thử lại
          </button>
        </div>
      )}

      {!error && !fulfillment && (
        <div className="glass rounded-2xl p-8 text-center">
          <Package className="mx-auto mb-3 text-white/20" size={36} />
          <p className="text-white/50 text-sm">Đơn hàng này chưa có thông tin vận chuyển</p>
          <p className="text-white/30 text-xs mt-1">Thông tin sẽ cập nhật sau khi đơn được xác nhận</p>
        </div>
      )}

      {fulfillment && (
        <>
          {/* Status headline */}
          <div className={`glass rounded-2xl p-5 border ${
            fulfillment.fulfillStatus === 'DELIVERED'
              ? 'border-emerald-500/20'
              : fulfillment.fulfillStatus === 'EXCEPTION'
              ? 'border-red-500/20'
              : fulfillment.fulfillStatus === 'AWAITING'
              ? 'border-white/8'
              : 'border-indigo-500/20'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                fulfillment.fulfillStatus === 'DELIVERED'
                  ? 'bg-emerald-500/20'
                  : fulfillment.fulfillStatus === 'EXCEPTION'
                  ? 'bg-red-500/20'
                  : fulfillment.fulfillStatus === 'AWAITING'
                  ? 'bg-white/8'
                  : 'bg-indigo-500/20'
              }`}>
                {fulfillment.fulfillStatus === 'DELIVERED'
                  ? <CheckCircle2 size={20} className="text-emerald-400" />
                  : fulfillment.fulfillStatus === 'EXCEPTION'
                  ? <AlertTriangle size={20} className="text-red-400" />
                  : fulfillment.fulfillStatus === 'AWAITING'
                  ? <Loader2 size={20} className="text-white/40 animate-spin" />
                  : <Truck size={20} className="text-indigo-400" />
                }
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${
                  fulfillment.fulfillStatus === 'AWAITING' ? 'text-white/60' : 'text-white'
                }`}>
                  {STATUS_LABELS[fulfillment.fulfillStatus] ?? fulfillment.fulfillStatus}
                </p>
                {fulfillment.fulfillStatus === 'AWAITING' ? (
                  <p className="text-white/35 text-xs mt-0.5">
                    Đơn hàng đang trong hàng đợi xử lý — thường mất 1–2 giờ làm việc
                  </p>
                ) : fulfillment.trackingEvents[0] ? (
                  <p className="text-white/40 text-xs mt-0.5">
                    Cập nhật {formatTimeAgo(fulfillment.trackingEvents[0].occurredAt)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Confirm delivery CTA — chỉ hiện cho CUSTOMER sở hữu đơn, khi đã giao thành công */}
          {isCustomer && fulfillment.fulfillStatus === 'DELIVERED' && (
            <div className="glass rounded-2xl p-5 border border-emerald-500/30 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                  <PartyPopper size={20} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Bạn đã nhận được hàng?</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    Xác nhận để hoàn tất đơn hàng và lưu lịch sử mua
                  </p>
                </div>
              </div>
              <button
                onClick={handleConfirmDelivery}
                disabled={confirming}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:scale-100"
                style={{
                  background: 'linear-gradient(135deg,#059669,#10b981)',
                  boxShadow: '0 4px 16px rgba(16,185,129,0.3)'
                }}
              >
                {confirming ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {confirming ? 'Đang xác nhận...' : 'Xác nhận đã nhận hàng'}
              </button>
            </div>
          )}

          {/* Progress steps — hide when AWAITING to avoid confusing UI */}
          {fulfillment.fulfillStatus !== 'AWAITING' && (
            <ProgressStepper status={fulfillment.fulfillStatus} />
          )}

          {/* Carrier info */}
          <CarrierCard fulfillment={fulfillment} />

          {/* Tracking timeline */}
          <TrackingTimeline events={fulfillment.trackingEvents} />
        </>
      )}
    </div>
  )
}
