'use client'

import { use } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, AlertCircle, CheckCircle, Truck, Star, ShoppingBag } from 'lucide-react'
import { useOrder } from '@/hooks/queries/useOrder'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { OrderRowSkeleton } from '@/components/shared/skeletons/OrderRowSkeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { OrderStatus } from '@/types'

const TIMELINE_STEPS: { status: OrderStatus; label: string; icon: typeof ShoppingBag }[] = [
  { status: 'PENDING',   label: 'Đặt hàng',   icon: ShoppingBag },
  { status: 'CONFIRMED', label: 'Xác nhận',    icon: CheckCircle },
  { status: 'SHIPPING',  label: 'Đang giao',   icon: Truck },
  { status: 'DONE',      label: 'Hoàn thành',  icon: Star },
]

const STATUS_ORDER: OrderStatus[] = ['PENDING', 'CONFIRMED', 'SHIPPING', 'DONE']

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: order, loading, error } = useOrder(id)

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <OrderRowSkeleton key={i} />)}
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error ?? 'Không tìm thấy đơn hàng'}</p>
          <button onClick={() => router.push('/orders')} className="btn-glass text-sm px-4 py-2">← Về đơn hàng</button>
        </div>
      </div>
    )
  }

  const currentStepIdx = STATUS_ORDER.indexOf(order.status as OrderStatus)
  const isCancelled = order.status === 'CANCELLED'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => router.push('/orders')} className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors">
          <ArrowLeft size={16} /> Quay lại
        </button>
        <h1 className="text-white font-bold">Đơn hàng #{order.id.slice(0, 8)}</h1>
        <StatusBadge status={order.status} />
      </div>

      {/* Timeline */}
      {!isCancelled && (
        <div className="glass rounded-2xl p-4 sm:p-6 overflow-x-auto">
          <div className="flex items-start justify-between min-w-[280px]">
            {TIMELINE_STEPS.map((step, i) => {
              const isDone = i <= currentStepIdx
              const isCurrent = i === currentStepIdx
              return (
                <div key={step.status} className="flex-1 flex flex-col items-center gap-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isDone ? 'bg-indigo-500/30 border-2 border-indigo-500' : 'bg-white/5 border-2 border-white/10'
                  }`}>
                    {isCurrent ? (
                      <span className="w-3 h-3 rounded-full bg-indigo-400 animate-live" />
                    ) : isDone ? (
                      <step.icon size={16} className="text-indigo-300" />
                    ) : (
                      <step.icon size={16} className="text-white/20" />
                    )}
                  </div>
                  <span className={`text-xs text-center ${isDone ? 'text-indigo-300' : 'text-white/30'}`}>{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left */}
        <div className="space-y-4">
          {/* Products */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold">Sản phẩm</h2>
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-3 border-b border-white/10 last:border-0">
                <div className="w-14 h-14 rounded-xl overflow-hidden glass flex-shrink-0 relative">
                  {item.imageUrl && <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" sizes="56px" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium line-clamp-1">{item.productName}</p>
                  <p className="text-white/40 text-xs">x{item.quantity} × {formatCurrency(item.unitPrice)}</p>
                </div>
                <p className="text-indigo-300 font-semibold text-sm flex-shrink-0">{formatCurrency(item.quantity * item.unitPrice)}</p>
              </div>
            ))}
            <div className="pt-2 space-y-1.5">
              <div className="flex justify-between text-sm text-white/60">
                <span>Phí vận chuyển</span><span className="text-emerald-400">Miễn phí</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-white">Tổng cộng</span>
                <span className="text-indigo-300 text-lg">{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Shipping */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-white font-semibold mb-3">Địa chỉ giao hàng</h2>
            <p className="text-white/70 text-sm">{order.shippingAddress}</p>
          </div>
        </div>

        {/* Right */}
        <div className="space-y-4">
          {/* Payment */}
          <div className="glass rounded-2xl p-6 space-y-3">
            <h2 className="text-white font-semibold">Thông tin thanh toán</h2>
            {order.payment ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Phương thức</span>
                  <span className="text-white">{order.payment.method}</span>
                </div>
                {order.payment.transactionId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Mã giao dịch</span>
                    <span className="text-white font-mono text-xs">{order.payment.transactionId}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Số tiền</span>
                  <span className="text-indigo-300 font-bold">{formatCurrency(order.payment.amount)}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-white/50">Trạng thái</span>
                  <StatusBadge status={order.payment.status} />
                </div>
                {order.payment.paidAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Thời gian</span>
                    <span className="text-white">{formatDate(order.payment.paidAt)}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-white/40 text-sm">Chưa có thông tin thanh toán</p>
            )}
          </div>

          {/* Support */}
          <div className="glass rounded-2xl p-6 space-y-3">
            <h2 className="text-white font-semibold">Hỗ trợ</h2>
            <button className="btn-glass w-full text-sm py-2">Liên hệ hỗ trợ</button>
            <button className="w-full text-sm py-2 rounded-xl text-white/50 hover:text-white/70 transition-colors">Báo cáo vấn đề</button>
          </div>
        </div>
      </div>
    </div>
  )
}
