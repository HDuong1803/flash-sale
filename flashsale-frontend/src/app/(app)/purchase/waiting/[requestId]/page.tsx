'use client'

import { use, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { usePurchaseResult } from '@/hooks/queries/usePurchaseResult'
import { useCampaigns } from '@/hooks/queries/useCampaigns'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { CampaignCard } from '@/components/customer/CampaignCard'

export default function PurchaseWaitingPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = use(params)
  const router = useRouter()

  const { data, error, errorCode, attemptCount, stop } = usePurchaseResult(requestId)

  const { data: campaigns } = useCampaigns()
  const otherCampaigns = (campaigns ?? []).filter((c) => c.status === 'ACTIVE').slice(0, 3)

  const isProcessing = !data || data.status === 'PROCESSING'
  const isReserved = data?.status === 'RESERVED'
  const isSoldOut = data?.status === 'SOLD_OUT'
  const isTimeout = attemptCount >= 30 && isProcessing

  useEffect(() => {
    if (isTimeout) stop()
  }, [isTimeout, stop])

  useEffect(() => {
    if (errorCode === 'UNAUTHORIZED') {
      toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
      router.push('/campaigns')
    }
  }, [errorCode, router])

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
            <div className="glass rounded-xl p-3 text-left space-y-2">
              <p className="text-white/40 text-xs uppercase">Tiến trình</p>
              <p className="text-white/70 text-sm">1. Xếp hàng yêu cầu mua</p>
              <p className="text-white/70 text-sm">2. Khóa tồn kho an toàn</p>
              <p className="text-white/70 text-sm">3. Tạo giữ chỗ để thanh toán</p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-white/40 text-xs">Lần thử: {attemptCount}/30</p>
              <p className="text-white/30 text-[11px] mt-1 font-mono">Mã yêu cầu: {requestId.slice(0, 12)}...</p>
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
            <div className="glass rounded-xl p-3 text-left">
              <p className="text-white/40 text-xs uppercase mb-1">Thông tin giữ chỗ</p>
              <p className="text-white/70 text-sm font-mono">Reservation: {data.reservationId?.slice(0, 16)}...</p>
              <p className="text-white/50 text-xs">Giữ chỗ chỉ có hiệu lực trong thời gian đếm ngược bên dưới.</p>
            </div>
            <CountdownTimer
              targetDate={data.expiredAt}
              size="lg"
              onExpire={() => {
                toast.error('Giữ chỗ đã hết hạn')
                router.push('/campaigns')
              }}
            />
            <div className="flex flex-col gap-3">
              <Link
                href={`/checkout?reservationId=${data.reservationId}&expiredAt=${encodeURIComponent(data.expiredAt ?? '')}`}
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
          <div className="space-y-3">
            <p className="text-red-400 text-sm">
              {errorCode === 'FORBIDDEN'
                ? 'Yêu cầu mua hàng này không thuộc tài khoản hiện tại.'
                : errorCode === 'NOT_FOUND'
                ? 'Không tìm thấy yêu cầu mua hàng. Có thể phiên đã hết hạn.'
                : errorCode === 'TIMEOUT'
                ? 'Hệ thống đang bận, vui lòng kiểm tra lại đơn hàng của bạn.'
                : error}
            </p>

            <div className="flex flex-col gap-2">
              <Link href="/orders" className="btn-primary block">Kiểm tra đơn hàng</Link>
              <button onClick={() => window.location.reload()} className="btn-glass">Thử lại</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
