'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Copy,
  CheckCircle,
  Clock,
  Building2,
  AlertCircle,
  XCircle,
  Loader2,
  WifiOff
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { usePaymentStatus } from '@/hooks/queries/usePaymentStatus'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'

// ─── Thời gian auto-redirect sau khi xác nhận thành công (ms) ─────────────────
const REDIRECT_DELAY_MS = 2_000

/** Thời gian tối đa chờ thanh toán (khớp với PAYMENT_TIMEOUT_MS trong hook) */
const PAYMENT_TIMEOUT_SECONDS = 10 * 60

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Ô hiển thị thông tin ngân hàng với nút copy */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-white/40 text-xs mb-0.5">{label}</p>
        <p className="text-white text-sm font-medium font-mono truncate">{value}</p>
      </div>
      <button
        onClick={handleCopy}
        title="Sao chép"
        className="ml-3 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0"
      >
        {copied
          ? <CheckCircle size={14} className="text-emerald-400" />
          : <Copy size={14} className="text-white/40" />
        }
      </button>
    </div>
  )
}

/**
 * Thanh tiến trình thời gian chờ — cho user biết còn bao nhiêu thời gian.
 * Thanh màu xanh → vàng → đỏ khi gần hết thời gian.
 * Giúp user không lo lắng khi chờ đợi và biết lúc nào cần hành động.
 */
function TimeoutProgressBar({ elapsedSeconds }: { elapsedSeconds: number }) {
  const progress = Math.min((elapsedSeconds / PAYMENT_TIMEOUT_SECONDS) * 100, 100)
  const remaining = Math.max(PAYMENT_TIMEOUT_SECONDS - elapsedSeconds, 0)
  const remainingMinutes = Math.floor(remaining / 60)
  const remainingSecondsDisplay = remaining % 60

  // Đổi màu theo mức độ: xanh (>50%) → vàng (20-50%) → đỏ (<20%)
  const barColor =
    progress < 50
      ? 'bg-emerald-500'
      : progress < 80
      ? 'bg-yellow-500'
      : 'bg-red-500'

  return (
    <div className="space-y-1.5">
      {/* Label + thời gian còn lại */}
      <div className="flex items-center justify-between">
        <span className="text-white/30 text-xs">Thời gian còn lại</span>
        <span className={`text-xs font-mono font-medium ${
          progress >= 80 ? 'text-red-400' : progress >= 50 ? 'text-yellow-400' : 'text-white/50'
        }`}>
          {remainingMinutes}:{String(remainingSecondsDisplay).padStart(2, '0')}
        </span>
      </div>
      {/* Thanh tiến trình */}
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Indicator trạng thái polling — hiển thị góc trên phải card.
 * Giúp user biết hệ thống đang theo dõi giao dịch của họ.
 */
function PollingIndicator({ elapsedSeconds }: { elapsedSeconds: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Chấm nhấp nháy — báo hiệu đang active */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="text-white/30 text-xs">
        Đang chờ {elapsedSeconds > 0 ? `(${elapsedSeconds}s)` : '...'}
      </span>
    </div>
  )
}

// ─── Màn hình trạng thái ────────────────────────────────────────────────────────

/** Hiển thị khi thanh toán thành công — auto redirect */
function SuccessOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl glass-strong z-10 space-y-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-emerald-500/20">
        <CheckCircle size={32} className="text-emerald-400" />
      </div>
      <div className="text-center">
        <p className="text-white font-bold text-lg">Thanh toán thành công!</p>
        <p className="text-white/50 text-sm mt-1 flex items-center gap-1 justify-center">
          <Loader2 size={12} className="animate-spin" />
          Đang chuyển đến đơn hàng...
        </p>
      </div>
    </div>
  )
}

/** Hiển thị khi thanh toán thất bại */
function FailedOverlay({ onBack }: { onBack: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl glass-strong z-10 space-y-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500/20">
        <XCircle size={32} className="text-red-400" />
      </div>
      <div className="text-center">
        <p className="text-white font-bold text-lg">Thanh toán thất bại</p>
        <p className="text-white/50 text-sm mt-1">Đơn giữ chỗ đã bị huỷ</p>
      </div>
      <button onClick={onBack} className="btn-primary px-6 py-2 text-sm">
        Về trang Flash Sale
      </button>
    </div>
  )
}

/** Hiển thị khi hết thời gian chờ (10 phút) */
function TimeoutOverlay({ onBack }: { onBack: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl glass-strong z-10 space-y-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-orange-500/20">
        <Clock size={32} className="text-orange-400" />
      </div>
      <div className="text-center">
        <p className="text-white font-bold text-lg">Hết thời gian thanh toán</p>
        <p className="text-white/50 text-sm mt-1">
          Đã quá 10 phút, đơn giữ chỗ có thể đã hết hạn
        </p>
      </div>
      <button onClick={onBack} className="btn-primary px-6 py-2 text-sm">
        Về trang Flash Sale
      </button>
    </div>
  )
}

/** Hiển thị khi user chưa đăng nhập */
function NotLoggedInState({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        <AlertCircle size={40} className="text-yellow-400 mx-auto" />
        <p className="text-white font-semibold">Cần đăng nhập để xem trạng thái thanh toán</p>
        <p className="text-white/50 text-sm">
          Thông tin chuyển khoản vẫn còn hiệu lực. Đăng nhập để hệ thống xác nhận tự động.
        </p>
        <button onClick={onLogin} className="btn-primary w-full">
          Đăng nhập
        </button>
      </div>
    </div>
  )
}

// ─── Main content ───────────────────────────────────────────────────────────────

function PendingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated } = useAuthContext()
  const { openAuthModal } = useUiContext()

  // Đọc thông tin từ URL params (được tạo bởi SepayService.buildPaymentPageUrl)
  const paymentId   = searchParams.get('paymentId') ?? ''
  const qrUrl       = searchParams.get('qr') ?? ''
  const amount      = Number(searchParams.get('amount') ?? 0)
  const content     = searchParams.get('content') ?? ''
  const bank        = searchParams.get('bank') ?? ''
  const account     = searchParams.get('account') ?? ''
  const accountName = searchParams.get('accountName') ?? ''

  // Polling trạng thái thanh toán — chỉ bật khi đã đăng nhập và có paymentId
  const { pollingState, orderId, elapsedSeconds } = usePaymentStatus(
    paymentId || null,
    isAuthenticated // Tắt polling khi chưa đăng nhập (API sẽ trả 401)
  )

  // Auto-redirect sau khi xác nhận thành công
  useEffect(() => {
    if (pollingState !== 'confirmed' || !orderId) return

    const timer = setTimeout(() => {
      router.push(`/payment/return?status=success&orderId=${orderId}`)
    }, REDIRECT_DELAY_MS)

    return () => clearTimeout(timer)
  }, [pollingState, orderId, router])

  // Không có paymentId → không phải navigate đúng → về trang chính
  if (!paymentId) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <WifiOff size={40} className="text-white/30 mx-auto" />
          <p className="text-white/60">Không tìm thấy thông tin thanh toán</p>
          <button onClick={() => router.push('/campaigns')} className="btn-glass">
            Về trang Flash Sale
          </button>
        </div>
      </div>
    )
  }

  // Chưa đăng nhập → không thể polling → hướng dẫn đăng nhập
  if (!isAuthenticated) {
    return <NotLoggedInState onLogin={() => openAuthModal('login')} />
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      {/* relative để đặt overlay thành công/thất bại lên trên */}
      <div className="relative glass rounded-2xl p-6 max-w-sm w-full space-y-5">

        {/* Overlay theo trạng thái */}
        {pollingState === 'confirmed' && <SuccessOverlay />}
        {pollingState === 'failed'    && <FailedOverlay onBack={() => router.push('/campaigns')} />}
        {pollingState === 'timeout'   && <TimeoutOverlay onBack={() => router.push('/campaigns')} />}

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-indigo-400" />
            <span className="text-white font-semibold">Chuyển khoản ngân hàng</span>
          </div>
          {/* Indicator nhấp nháy — chỉ hiện khi đang chờ */}
          {pollingState === 'waiting' && (
            <PollingIndicator elapsedSeconds={elapsedSeconds} />
          )}
        </div>

        {/* ── QR Code ───────────────────────────────────────────────────────── */}
        {qrUrl && (
          <div className="flex justify-center">
            <div className="glass rounded-xl p-3 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="Mã QR chuyển khoản VietQR"
                className="w-52 h-52 rounded-lg"
                onError={e => {
                  // Ẩn QR nếu load ảnh thất bại — user vẫn có thể chuyển khoản thủ công
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          </div>
        )}

        {/* ── Thông tin chuyển khoản ────────────────────────────────────────── */}
        <div className="glass rounded-xl p-4 space-y-0">
          {bank && account && (
            <CopyField label={`Ngân hàng ${bank}`} value={account} />
          )}
          {accountName && (
            <CopyField label="Chủ tài khoản" value={accountName} />
          )}
          {amount > 0 && (
            <CopyField label="Số tiền" value={formatCurrency(amount)} />
          )}
          <CopyField label="Nội dung chuyển khoản" value={content} />
        </div>

        {/* ── Hướng dẫn ─────────────────────────────────────────────────────── */}
        <div className="glass rounded-xl p-3 flex items-start gap-2">
          <Clock size={14} className="text-indigo-400 flex-shrink-0 mt-0.5" />
          <p className="text-white/50 text-xs leading-relaxed">
            Sau khi chuyển khoản, đơn hàng sẽ tự động xác nhận trong vài giây.
            {' '}<strong className="text-white/70">Nhập đúng nội dung chuyển khoản</strong>{' '}
            để hệ thống nhận diện giao dịch.
          </p>
        </div>

        {/* ── Thanh thời gian chờ ────────────────────────────────────────────── */}
        {pollingState === 'waiting' && (
          <TimeoutProgressBar elapsedSeconds={elapsedSeconds} />
        )}

        {/* ── Huỷ ───────────────────────────────────────────────────────────── */}
        <button
          onClick={() => router.push('/payment/cancel')}
          className="w-full flex items-center justify-center gap-1.5 text-white/25 text-xs hover:text-white/50 transition-colors py-1"
        >
          <XCircle size={12} />
          Hủy thanh toán
        </button>
      </div>
    </div>
  )
}

// ─── Page export ────────────────────────────────────────────────────────────────

export default function PaymentPendingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-2xl p-8 text-center">
          <Loader2 className="text-indigo-400 animate-spin mx-auto mb-3" size={32} />
          <p className="text-white/60 text-sm">Đang tải...</p>
        </div>
      </div>
    }>
      <PendingContent />
    </Suspense>
  )
}
