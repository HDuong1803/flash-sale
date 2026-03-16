'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

export default function PaymentReturnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const orderId = searchParams.get('orderId')
  const status = searchParams.get('status') // 'success' | 'failed' | 'cancelled'

  // No params at all → not a real gateway redirect
  useEffect(() => {
    if (!orderId && !status) router.replace('/campaigns')
  }, [orderId, status, router])

  if (!orderId && !status) return null

  if (status === 'success') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-6 animate-slide-up">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-500/20 glow-success">
              <CheckCircle size={40} className="text-emerald-400" />
            </div>
          </div>
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">Thanh toán thành công!</h2>
            <p className="text-white/50 text-sm">Đơn hàng của bạn đang được xử lý</p>
          </div>
          {orderId && (
            <div className="glass rounded-xl px-4 py-2 inline-block mx-auto">
              <span className="text-indigo-300 font-mono text-sm font-bold">
                #{orderId.slice(0, 8).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-3">
            {orderId && (
              <button onClick={() => router.push(`/orders/${orderId}`)} className="btn-primary">
                Xem đơn hàng
              </button>
            )}
            <button onClick={() => router.push('/campaigns')} className="btn-glass">
              Tiếp tục mua sắm
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-6 animate-slide-up">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center bg-red-500/20 glow-error">
              <XCircle size={40} className="text-red-400" />
            </div>
          </div>
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">Thanh toán thất bại</h2>
            <p className="text-white/50 text-sm">Vui lòng thử lại hoặc chọn phương thức khác</p>
          </div>
          <div className="glass-brand rounded-xl p-3 flex items-start gap-2 text-left">
            <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-white/50 text-xs">
              Nếu đơn giữ chỗ đã hết hạn, bạn cần quay lại Flash Sale để đặt lại.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={() => router.push('/campaigns')} className="btn-primary">
              Về trang Flash Sale
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 'cancelled' or any other status with params
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
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
        <button onClick={() => router.push('/campaigns')} className="btn-primary w-full">
          Về trang Flash Sale
        </button>
      </div>
    </div>
  )
}
