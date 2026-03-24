'use client'

import { useRouter } from 'next/navigation'
import { XCircle, AlertTriangle } from 'lucide-react'

export default function PaymentCancelPage() {
  const router = useRouter()

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-6 animate-slide-up">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center bg-orange-500/20">
            <XCircle size={40} className="text-orange-400" />
          </div>
        </div>
        <div>
          <h2 className="text-white text-2xl font-bold mb-2">Đã hủy thanh toán</h2>
          <p className="text-white/50 text-sm">Bạn đã hủy quá trình thanh toán</p>
        </div>
        <div className="glass rounded-xl p-3 flex items-start gap-2 text-left">
          <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-white/50 text-xs">
            Đơn giữ chỗ vẫn còn hiệu lực trong thời gian ngắn. Quay lại để hoàn tất thanh toán hoặc để hết hạn tự động.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.back()}
            className="btn-primary w-full"
          >
            Quay lại thanh toán
          </button>
          <button
            onClick={() => router.push('/campaigns')}
            className="btn-glass w-full"
          >
            Về trang Flash Sale
          </button>
        </div>
      </div>
    </div>
  )
}
