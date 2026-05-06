'use client'

// Trang chi tiết đơn hàng dành cho merchant
// Hiển thị đầy đủ: thông tin đơn, sản phẩm, khách hàng, thanh toán, fulfillment
// Truy cập từ /merchant/orders → click vào một đơn hàng

import { use } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, AlertCircle, Package, Truck, CreditCard,
  MapPin, User, CheckCircle2, Clock, XCircle,
} from 'lucide-react'
import { useOrder } from '@/hooks/queries/useOrder'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { OrderRowSkeleton } from '@/components/shared/skeletons/OrderRowSkeleton'
import { formatCurrency, formatDate } from '@/lib/utils'

// ─── Nhãn trạng thái thanh toán bằng tiếng Việt ─────────────────────────────

function PaymentStatusIcon({ status }: { status: string }) {
  if (status === 'SUCCESS') return <CheckCircle2 size={15} className="text-emerald-400" />
  if (status === 'FAILED')  return <XCircle      size={15} className="text-red-400" />
  return <Clock size={15} className="text-yellow-400" />
}

// ─── Section container nhất quán ─────────────────────────────────────────────

function Section({ title, icon, children }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
        {icon}
        <h2 className="text-white font-semibold text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Row hiển thị cặp nhãn – giá trị ─────────────────────────────────────────

function InfoRow({ label, value, mono = false }: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="text-white/45 text-sm flex-shrink-0">{label}</span>
      <span className={`text-right text-sm ${mono ? 'font-mono text-xs text-white/80' : 'text-white'}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Trang chính ──────────────────────────────────────────────────────────────

export default function MerchantOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: order, loading, error } = useOrder(id)

  // — Trạng thái loading ——————————————————————————————————————————————————————
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <OrderRowSkeleton key={i} />)}
      </div>
    )
  }

  // — Trạng thái lỗi hoặc không tìm thấy ————————————————————————————————————
  if (error || !order) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error ?? 'Không tìm thấy đơn hàng'}</p>
          <button
            onClick={() => router.push('/merchant/orders')}
            className="btn-glass text-sm px-4 py-2"
          >
            ← Về danh sách đơn
          </button>
        </div>
      </div>
    )
  }

  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push('/merchant/orders')}
          className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Quay lại
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-white font-bold">Đơn #{order.id.slice(0, 10)}</h1>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Tóm tắt nhanh — KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Giá trị đơn',    value: formatCurrency(order.totalAmount), color: 'text-emerald-300' },
          { label: 'Số sản phẩm',   value: `${totalItems} sản phẩm`,           color: 'text-indigo-300' },
          { label: 'Trạng thái',     value: <StatusBadge status={order.status} />, color: '' },
          { label: 'Ngày đặt',       value: formatDate(order.createdAt),        color: 'text-white/70' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass rounded-2xl p-4 space-y-1">
            <p className="text-white/40 text-xs">{label}</p>
            <p className={`font-bold text-sm ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Cột trái — sản phẩm + địa chỉ giao hàng */}
        <div className="lg:col-span-2 space-y-6">

          {/* Sản phẩm trong đơn */}
          <Section title="Sản phẩm đặt hàng" icon={<Package size={15} className="text-indigo-400" />}>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  {/* Ảnh sản phẩm */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden glass flex-shrink-0 relative">
                    {item.imageUrl && (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    )}
                  </div>
                  {/* Thông tin */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium line-clamp-1">{item.productName}</p>
                    <p className="text-white/40 text-xs mt-0.5">
                      x{item.quantity} × {formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                  {/* Thành tiền */}
                  <p className="text-indigo-300 font-semibold text-sm flex-shrink-0">
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </p>
                </div>
              ))}

              {/* Tổng cộng */}
              <div className="pt-3 space-y-1.5">
                <div className="flex justify-between text-sm text-white/50">
                  <span>Phí vận chuyển</span>
                  <span className="text-emerald-400">Miễn phí</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-white">Tổng đơn</span>
                  <span className="text-emerald-300 text-lg">{formatCurrency(order.totalAmount)}</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Địa chỉ giao hàng */}
          <Section title="Địa chỉ giao hàng" icon={<MapPin size={15} className="text-orange-400" />}>
            <p className="text-white/70 text-sm leading-relaxed">{order.shippingAddress}</p>
          </Section>

        </div>

        {/* Cột phải — thông tin khách + thanh toán + trạng thái giao vận */}
        <div className="space-y-6">

          {/* Thông tin khách hàng */}
          <Section title="Khách hàng" icon={<User size={15} className="text-violet-400" />}>
            {order.customer?.fullName && (
              <InfoRow label="Tên khách" value={order.customer.fullName} />
            )}
            <InfoRow label="Mã đơn" value={`#${order.id.slice(0, 10)}`} mono />
          </Section>

          {/* Thông tin thanh toán */}
          <Section title="Thanh toán" icon={<CreditCard size={15} className="text-emerald-400" />}>
            {order.payment ? (
              <>
                <InfoRow label="Phương thức" value={order.payment.method} />
                <InfoRow
                  label="Trạng thái"
                  value={
                    <div className="flex items-center gap-1.5">
                      <PaymentStatusIcon status={order.payment.status} />
                      <StatusBadge status={order.payment.status} />
                    </div>
                  }
                />
                <InfoRow label="Giá trị"   value={<span className="text-emerald-300 font-bold">{formatCurrency(order.payment.amount)}</span>} />
                {order.payment.paidAt && (
                  <InfoRow label="Thời gian" value={formatDate(order.payment.paidAt)} />
                )}
                {order.payment.transactionId && (
                  <div className="pt-2 space-y-1.5">
                    <span className="text-white/45 text-sm block">Mã giao dịch</span>
                    <code className="text-white/70 font-mono text-xs break-all bg-white/5 rounded-lg px-3 py-2 block leading-relaxed">
                      {order.payment.transactionId}
                    </code>
                  </div>
                )}
              </>
            ) : (
              <p className="text-white/40 text-sm">Chưa có thông tin thanh toán</p>
            )}
          </Section>

          {/* Trạng thái giao vận */}
          <Section title="Giao vận" icon={<Truck size={15} className="text-blue-400" />}>
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              <span className="text-white/50 text-xs">
                {order.status === 'PENDING'   && '— Chờ xác nhận'}
                {order.status === 'CONFIRMED' && '— Đang chuẩn bị hàng'}
                {order.status === 'SHIPPING'  && '— Đang trên đường giao'}
                {order.status === 'DONE'      && '— Đã giao thành công'}
                {order.status === 'CANCELLED' && '— Đã hủy'}
              </span>
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}
