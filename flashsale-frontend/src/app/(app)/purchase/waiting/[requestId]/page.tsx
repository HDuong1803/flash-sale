'use client'

import { use, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { usePurchaseResult } from '@/hooks/queries/usePurchaseResult'
import { useCampaigns } from '@/hooks/queries/useCampaigns'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { CampaignCard } from '@/components/customer/CampaignCard'

export default function PurchaseWaitingPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = use(params)
  const router = useRouter()

  const { data, loading, error, attemptCount, stop } = usePurchaseResult(requestId)

  const { data: campaigns } = useCampaigns()
  const otherCampaigns = campaigns.filter((c) => c.status === 'ACTIVE').slice(0, 3)

  const isProcessing = !data || data.status === 'PROCESSING'
  const isReserved = data?.status === 'RESERVED'
  const isSoldOut = data?.status === 'SOLD_OUT'
  const isTimeout = attemptCount >= 30 && isProcessing

  useEffect(() => {
    if (isTimeout) stop()
  }, [isTimeout, stop])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-6">
        {/* PROCESSING */}
        {isProcessing && !isTimeout && (
          <>
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center glass-brand">
                <Loader2 size={40} className="text-indigo-400 animate-spin" />
              </div>
            </div>
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Đang đặt chỗ sản phẩm cho bạn...</h2>
              <p className="text-white/50 text-sm">Hệ thống đang xử lý hàng nghìn yêu cầu đồng thời</p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-white/40 text-xs">Lần thử: {attemptCount}/30</p>
            </div>
          </>
        )}

        {/* TIMEOUT */}
        {isTimeout && (
          <>
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-orange-500/20">
                <AlertTriangle size={40} className="text-orange-400" />
              </div>
            </div>
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Xử lý mất nhiều thời gian hơn dự kiến</h2>
              <p className="text-white/50 text-sm">Đơn hàng của bạn có thể đã được xử lý</p>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/orders" className="btn-primary">Kiểm tra đơn hàng</Link>
              <button onClick={() => window.location.reload()} className="btn-glass">Thử lại</button>
            </div>
          </>
        )}

        {/* RESERVED */}
        {isReserved && data?.expiredAt && (
          <>
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-500/20">
                <CheckCircle size={40} className="text-emerald-400" />
              </div>
            </div>
            <div>
              <h2 className="text-white text-xl font-bold mb-1">Đặt hàng thành công!</h2>
              <p className="text-white/50 text-sm">Hoàn tất thanh toán trong:</p>
            </div>
            <CountdownTimer
              targetDate={data.expiredAt}
              size="lg"
              onExpire={() => {
                alert('Reservation đã hết hạn')
                router.push('/campaigns')
              }}
            />
            <div className="flex flex-col gap-3">
              <Link
                href={`/checkout?reservationId=${data.reservationId}`}
                className="btn-primary"
              >
                Tiến hành thanh toán
              </Link>
              <Link href="/campaigns" className="text-white/40 text-sm hover:text-white/60 transition-colors">
                Hủy
              </Link>
            </div>
          </>
        )}

        {/* SOLD_OUT */}
        {isSoldOut && (
          <>
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-red-500/20">
                <XCircle size={40} className="text-red-400" />
              </div>
            </div>
            <div>
              <h2 className="text-white text-xl font-bold mb-2">Rất tiếc, sản phẩm đã hết hàng</h2>
              <p className="text-white/50 text-sm">Bạn có thể xem các flash sale khác đang diễn ra</p>
            </div>
            {otherCampaigns.length > 0 && (
              <div className="space-y-3 text-left">
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Flash Sale khác</p>
                {otherCampaigns.map((c) => (
                  <CampaignCard key={c.id} campaign={c} />
                ))}
              </div>
            )}
            <Link href="/campaigns" className="btn-glass block">Về trang Flash Sale</Link>
          </>
        )}

        {/* Error state */}
        {error && !isTimeout && (
          <div>
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button onClick={() => window.location.reload()} className="btn-glass">Thử lại</button>
          </div>
        )}
      </div>
    </div>
  )
}
