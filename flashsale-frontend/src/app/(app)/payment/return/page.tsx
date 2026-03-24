'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Package,
  Loader2,
  ArrowRight
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useOrder } from '@/hooks/queries/useOrder'

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Hiển thị chi tiết đơn hàng: sản phẩm, số lượng, giá */
function OrderSummary({ orderId }: { orderId: string }) {
  const { data: order, loading } = useOrder(orderId)

  if (loading) {
    return (
      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <Loader2 size={16} className="text-indigo-400 animate-spin flex-shrink-0" />
        <span className="text-white/40 text-sm">Đang tải thông tin đơn hàng...</span>
      </div>
    )
  }

  if (!order) return null

  return (
    <div className="glass rounded-xl p-4 space-y-3 text-left w-full">
      {/* Mã đơn hàng */}
      <div className="flex items-center justify-between">
        <span className="text-white/40 text-xs">Mã đơn hàng</span>
        <span className="text-indigo-300 font-mono text-sm font-bold">
          #{order.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Danh sách sản phẩm */}
      {order.items?.length > 0 && (
        <div className="space-y-2 border-t border-white/5 pt-3">
          {order.items.map(item => (
            <div key={item.id} className="flex items-center gap-3">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.productName}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-white/5"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <Package size={16} className="text-white/20" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">
                  {item.productName}
                </p>
                <p className="text-white/40 text-xs">
                  x{item.quantity} — {formatCurrency(item.unitPrice)}/sp
                </p>
              </div>
              <span className="text-white text-sm font-semibold flex-shrink-0">
                {formatCurrency(item.unitPrice * item.quantity)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tổng tiền */}
      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-white/40 text-sm">Tổng thanh toán</span>
        <span className="text-emerald-400 font-bold text-base">
          {formatCurrency(order.totalAmount)}
        </span>
      </div>

      {/* Địa chỉ giao hàng */}
      {order.shippingAddress && (
        <div className="border-t border-white/5 pt-3">
          <p className="text-white/40 text-xs mb-1">Giao đến</p>
          <p className="text-white/70 text-xs leading-relaxed">{order.shippingAddress}</p>
        </div>
      )}
    </div>
  )
}

// ─── Màn hình trạng thái ─────────────────────────────────────────────────────

function SuccessScreen({
  orderId,
  onViewOrder,
  onContinue
}: {
  orderId: string | null
  onViewOrder: () => void
  onContinue: () => void
}) {
  return (
    <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-6 animate-slide-up">
      {/* Icon */}
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-500/20">
          <CheckCircle size={40} className="text-emerald-400" />
        </div>
      </div>

      {/* Tiêu đề */}
      <div>
        <h2 className="text-white text-2xl font-bold mb-2">Thanh toán thành công!</h2>
        <p className="text-white/50 text-sm">Đơn hàng của bạn đang được xử lý</p>
      </div>

      {/* Chi tiết đơn hàng */}
      {orderId && <OrderSummary orderId={orderId} />}

      {/* Buttons */}
      <div className="flex flex-col gap-3">
        {orderId && (
          <button
            onClick={onViewOrder}
            className="btn-primary flex items-center justify-center gap-2"
          >
            Xem đơn hàng
            <ArrowRight size={16} />
          </button>
        )}
        <button onClick={onContinue} className="btn-glass">
          Tiếp tục mua sắm
        </button>
      </div>
    </div>
  )
}

function FailedScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-6 animate-slide-up">
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center bg-red-500/20">
          <XCircle size={40} className="text-red-400" />
        </div>
      </div>
      <div>
        <h2 className="text-white text-2xl font-bold mb-2">Thanh toán thất bại</h2>
        <p className="text-white/50 text-sm">Vui lòng thử lại hoặc chọn phương thức khác</p>
      </div>
      <div className="glass rounded-xl p-3 flex items-start gap-2 text-left">
        <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-white/50 text-xs">
          Nếu đơn giữ chỗ đã hết hạn, bạn cần quay lại Flash Sale để đặt lại.
        </p>
      </div>
      <button onClick={onBack} className="btn-primary w-full">
        Về trang Flash Sale
      </button>
    </div>
  )
}

function CancelledScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-6 animate-slide-up">
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center bg-orange-500/20">
          <AlertTriangle size={40} className="text-orange-400" />
        </div>
      </div>
      <div>
        <h2 className="text-white text-2xl font-bold mb-2">Bạn đã hủy thanh toán</h2>
        <p className="text-white/50 text-sm">Đơn hàng giữ chỗ có thể đã hết hạn</p>
      </div>
      <button onClick={onBack} className="btn-primary w-full">
        Về trang Flash Sale
      </button>
    </div>
  )
}

// ─── Main content ─────────────────────────────────────────────────────────────

function ReturnContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const orderId = searchParams.get('orderId')
  const status = searchParams.get('status') // 'success' | 'failed' | 'cancelled'

  // Không có params hợp lệ → không phải redirect từ gateway → về trang chính
  useEffect(() => {
    if (!orderId && !status) router.replace('/campaigns')
  }, [orderId, status, router])

  if (!orderId && !status) return null

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      {status === 'success' && (
        <SuccessScreen
          orderId={orderId}
          onViewOrder={() => router.push(`/orders/${orderId}`)}
          onContinue={() => router.push('/campaigns')}
        />
      )}
      {status === 'failed' && (
        <FailedScreen onBack={() => router.push('/campaigns')} />
      )}
      {/* 'cancelled' hoặc bất kỳ status không xác định nào */}
      {status !== 'success' && status !== 'failed' && (
        <CancelledScreen onBack={() => router.push('/campaigns')} />
      )}
    </div>
  )
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-2xl p-8 text-center">
          <Loader2 className="text-indigo-400 animate-spin mx-auto mb-3" size={32} />
          <p className="text-white/60 text-sm">Đang tải...</p>
        </div>
      </div>
    }>
      <ReturnContent />
    </Suspense>
  )
}
