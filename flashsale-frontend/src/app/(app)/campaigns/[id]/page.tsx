'use client'

/**
 * CampaignDetailPage — Trang chi tiết chiến dịch flash sale.
 *
 * Layout:
 *   [Back button]
 *   [2 cột: Gallery | Purchase Panel]
 *   [Trust badges + payment methods]
 *   [Tabs: Mô tả / Người bán]
 *
 * Fields hiển thị:
 * - Giá gốc, giá sale, số tiền tiết kiệm, % giảm
 * - Số đã bán vs tổng số (computed: saleQuantity - remainingQuantity)
 * - Tiến độ thời gian chiến dịch (time elapsed / total duration)
 * - Urgency indicator khi tồn kho < 20%
 * - Giới hạn mua per-user với progress
 * - Phương thức thanh toán
 * - Trust badges
 * - Real-time WebSocket stock/price updates
 * - Activity feed: giao dịch gần nhất real-time (social proof)
 */

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import {
  Store,
  AlertCircle,
  ArrowLeft,
  Minus,
  Plus,
  Info,
  Loader2,
  ImageOff,
  Clock,
  Flame,
  ShieldCheck,
  Zap,
  TrendingDown,
  Users,
  Tag,
  CreditCard,
  CheckCircle2,
  CalendarClock,
  Timer,
  BarChart3
} from 'lucide-react'
import { useCampaign } from '@/hooks/queries/useCampaign'
import { usePurchase } from '@/hooks/mutations/usePurchase'
import { usePreRegister } from '@/hooks/mutations/usePreRegister'
import { useCancelPreRegister } from '@/hooks/mutations/useCancelPreRegister'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { StockProgressBar } from '@/components/shared/StockProgressBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CampaignCardSkeleton } from '@/components/shared/skeletons/CampaignCardSkeleton'
import { formatCurrency, calculateDiscount, formatDate } from '@/lib/utils'
import { useStockSocket } from '@/hooks/useStockSocket'
import { usePurchaseActivity } from '@/hooks/usePurchaseActivity'
import { ApiError } from '@/lib/api-client'

// ─── Hằng số ─────────────────────────────────────────────────────────────────

/** Ngưỡng tồn kho để hiện badge "Sắp hết hàng" (20%) */
const URGENCY_THRESHOLD_PCT = 0.2

/** Ngưỡng tồn kho để hiện badge "Rất ít hàng" (10%) */
const CRITICAL_THRESHOLD_PCT = 0.1

/** Icon các phương thức thanh toán được chấp nhận */
const PAYMENT_METHODS = [
  { label: 'VNPAY', color: '#1a73e8', abbr: 'VN' },
  { label: 'MoMo', color: '#ae2d7a', abbr: 'MM' },
  { label: 'Stripe', color: '#635bff', abbr: 'ST' }
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tính % tiến độ thời gian chiến dịch đã trôi qua (0–100) */
function calcTimeProgress(startTime: string, endTime: string): number {
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  const now = Date.now()
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

/** Tính tổng thời lượng chiến dịch (giờ) */
function calcDurationHours(startTime: string, endTime: string): number {
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime()
  return Math.round(ms / (1000 * 60 * 60))
}

/** Trả về chuỗi mô tả mức urgency dựa trên tỉ lệ tồn kho */
function getUrgencyLevel(remaining: number, total: number): 'none' | 'low' | 'high' {
  if (total <= 0) return 'none'
  const ratio = remaining / total
  if (ratio <= CRITICAL_THRESHOLD_PCT) return 'high'
  if (ratio <= URGENCY_THRESHOLD_PCT) return 'low'
  return 'none'
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── ActivityItem ─────────────────────────────────────────────────────────────

/**
 * Một dòng trong activity feed: "✓ Vừa có người mua thành công · X giây trước"
 *
 * Dùng CSS animation fade-in khi mount để transition mượt.
 * Component tự không xóa mình — việc xóa do usePurchaseActivity quản lý
 * (xóa khỏi mảng sau TTL → React unmount component tự nhiên).
 */
function ActivityItem({ purchasedAt }: { purchasedAt: Date }) {
  const secondsAgo = Math.round((Date.now() - purchasedAt.getTime()) / 1000)
  const label = secondsAgo <= 1 ? 'vừa xong' : `${secondsAgo} giây trước`

  return (
    <div
      className="flex items-center gap-2 text-xs text-white/50 animate-fade-in"
      style={{ animationDuration: '300ms' }}
    >
      {/* Chấm xanh nhỏ — ký hiệu giao dịch thành công */}
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
      <span>
        Vừa có người mua thành công
        <span className="text-white/25 ml-1">· {label}</span>
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const { data: campaign, loading, error } = useCampaign(id)
  const { purchase, loading: buyLoading } = usePurchase()
  const { preRegister, loading: regLoading } = usePreRegister()
  const { cancelPreRegister, loading: cancelRegLoading } = useCancelPreRegister()
  const { isAuthenticated } = useAuthContext()
  const { openAuthModal } = useUiContext()

  // ─── Local state ────────────────────────────────────────────────────────────
  const [quantity, setQuantity] = useState(1)
  const [selectedProductIdx, setSelectedProductIdx] = useState(0)
  const [activeTab, setActiveTab] = useState<'desc' | 'seller'>('desc')
  const [mainImgError, setMainImgError] = useState(false)
  const [thumbErrors, setThumbErrors] = useState<Record<string, boolean>>({})
  /** null = chưa có override local (dùng giá trị API) */
  const [preRegisteredOverride, setPreRegisteredOverride] = useState<boolean | null>(null)
  const [pendingReservation, setPendingReservation] = useState<{
    id: string
    expiredAt: string
    campaignProductId: string
  } | null>(null)

  // ─── WebSocket real-time ────────────────────────────────────────────────────
  /** Nhận cập nhật tồn kho và giá real-time qua Socket.IO */
  const { stockMap, priceMap, isConnected } = useStockSocket(campaign?.id)

  /**
   * Feed giao dịch gần nhất — chỉ subscribe khi campaign đang ACTIVE.
   * Truyền undefined khi không active để tránh mở kết nối WebSocket thừa.
   */
  const recentActivities = usePurchaseActivity(
    campaign?.status === 'ACTIVE' ? campaign.id : undefined
  )

  // ─── Derived values ─────────────────────────────────────────────────────────
  const product = campaign?.campaignProducts?.[selectedProductIdx]

  /** Tồn kho: ưu tiên WebSocket nếu có update, fallback về API */
  const wsRemaining = product ? (stockMap[product.id] ?? null) : null
  const isScheduled = campaign?.status === 'SCHEDULED'
  const isActive = campaign?.status === 'ACTIVE'
  const isEnded = campaign?.status === 'ENDED'

  const displayRemaining = wsRemaining !== null
    ? wsRemaining
    : product && isScheduled && product.remainingQuantity === 0 && product.saleQuantity > 0
    ? product.saleQuantity
    : (product?.remainingQuantity ?? 0)

  /** Giá: ưu tiên WebSocket nếu pricing engine đã thay đổi */
  const wsPrice = product ? (priceMap[product.id] ?? null) : null
  const displayPrice = wsPrice !== null ? wsPrice : (product?.salePrice ?? 0)

  const originalPrice = product?.product?.originalPrice ?? 0
  const discount = product ? calculateDiscount(originalPrice, displayPrice) : 0

  /** Số tiền tiết kiệm tuyệt đối */
  const savingsAmount = originalPrice - displayPrice

  /** Số sản phẩm đã bán = tổng - còn lại */
  const soldCount = product
    ? Math.max(0, product.saleQuantity - displayRemaining)
    : 0

  const alreadyPaidQuantity = product?.userPaidQuantity ?? 0
  const maxSelectableByLimit = product
    ? Math.max(0, product.perUserLimit - alreadyPaidQuantity)
    : 0
  const maxSelectableQuantity = product
    ? Math.max(0, Math.min(maxSelectableByLimit, displayRemaining))
    : 0
  const effectiveQuantity =
    maxSelectableQuantity > 0
      ? Math.max(1, Math.min(quantity, maxSelectableQuantity))
      : 1

  const isSoldOut = isActive ? (displayRemaining <= 0) : false
  const isLive = isActive && isConnected
  const hasPendingForSelectedProduct = !!(
    pendingReservation && product && pendingReservation.campaignProductId === product.id
  )

  /** Urgency dựa trên tỉ lệ tồn kho */
  const urgency = product
    ? getUrgencyLevel(displayRemaining, product.saleQuantity)
    : 'none'

  /** Tiến độ thời gian chiến dịch (%) */
  const timeProgress = useMemo(() => {
    if (!campaign || !isActive) return 0
    return calcTimeProgress(campaign.startTime, campaign.endTime)
  }, [campaign, isActive])

  /** Tổng thời lượng chiến dịch (giờ) */
  const durationHours = useMemo(() => {
    if (!campaign) return 0
    return calcDurationHours(campaign.startTime, campaign.endTime)
  }, [campaign])

  const isPreRegistered = preRegisteredOverride !== null
    ? preRegisteredOverride
    : (campaign?.isPreRegistered ?? null)

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSelectProduct = (idx: number) => {
    setSelectedProductIdx(idx)
    setMainImgError(false)
    setQuantity(1)
  }

  const handleBuy = async () => {
    if (!isAuthenticated) { openAuthModal('login'); return }
    if (!product) return
    try {
      const { requestId } = await purchase(product.id, effectiveQuantity)
      router.push(`/purchase/waiting/${requestId}`)
    } catch (err) {
      // Nếu backend báo có reservation đang giữ → hiện banner tiếp tục thanh toán
      if (err instanceof ApiError && err.code === 'RESERVATION_EXISTS') {
        const reservationId = err.metadata?.reservationId
        const expiredAt = err.metadata?.expiredAt
        if (reservationId && expiredAt) {
          setPendingReservation({ id: reservationId, expiredAt, campaignProductId: product.id })
          return
        }
      }
    }
  }

  const handlePreRegister = async () => {
    if (!isAuthenticated) { openAuthModal('login'); return }
    if (!campaign) return
    try {
      await preRegister(campaign.id)
      setPreRegisteredOverride(true)
    } catch { /* toast shown by hook */ }
  }

  const handleCancelPreRegister = async () => {
    if (!campaign) return
    try {
      await cancelPreRegister(campaign.id)
      setPreRegisteredOverride(false)
    } catch { /* toast shown by hook */ }
  }

  // ─── Loading / Error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {Array.from({ length: 2 }).map((_, i) => <CampaignCardSkeleton key={i} />)}
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error ?? 'Không tìm thấy chiến dịch'}</p>
          <button onClick={() => router.push('/campaigns')} className="btn-glass text-sm px-4 py-2">
            ← Về danh sách
          </button>
        </div>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Breadcrumb / Back */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors"
        >
          <ArrowLeft size={15} />
          <span>Flash Sale</span>
        </button>
        <span className="text-white/20">/</span>
        <span className="text-white/60 truncate max-w-[200px]">{campaign.name}</span>
      </div>

      {/* ══════════════════════════════════════════════
          Layout 2 cột: Gallery (trái) + Purchase (phải)
          ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">

        {/* ────────────── LEFT: Image Gallery ────────────── */}
        <div className="space-y-3">

          {/* Ảnh chính */}
          <div className="relative aspect-square glass rounded-2xl overflow-hidden group">
            {product?.product?.imageUrl && !mainImgError ? (
              <Image
                src={product.product.imageUrl}
                alt={product.product?.name ?? ''}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                sizes="(max-width: 768px) 100vw, 50vw"
                onError={() => setMainImgError(true)}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Store size={48} className="text-white/20" />
                {mainImgError && <span className="text-white/20 text-xs">Không tải được ảnh</span>}
              </div>
            )}

            {/* Badge trạng thái trên ảnh */}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              {discount > 0 && (
                <span
                  className="text-white text-xs font-black px-2.5 py-1 rounded-lg shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}
                >
                  -{discount}%
                </span>
              )}
              {urgency === 'high' && isActive && (
                <span className="flex items-center gap-1 bg-red-500/90 text-white text-xs font-bold px-2 py-0.5 rounded-lg">
                  <Flame size={11} />
                  Sắp hết
                </span>
              )}
            </div>

            {/* Connection indicator góc trên phải */}
            {isActive && (
              <div className="absolute top-3 right-3">
                {isConnected ? (
                  <span className="flex items-center gap-1 glass-strong text-xs text-emerald-400 px-2 py-1 rounded-lg">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-live" />
                    Live
                  </span>
                ) : (
                  <span className="glass-strong text-white/30 text-xs px-2 py-1 rounded-lg">
                    Offline
                  </span>
                )}
              </div>
            )}

            {/* Overlay Hết hàng */}
            {isSoldOut && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <span className="glass-strong text-white font-bold text-lg px-6 py-3 rounded-xl border border-white/20">
                  HẾT HÀNG
                </span>
              </div>
            )}
          </div>

          {/* Thumbnail strip — khi có nhiều sản phẩm */}
          {(campaign.campaignProducts?.length ?? 0) > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(campaign.campaignProducts ?? []).map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProduct(i)}
                  className={`relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 transition-all glass ${
                    i === selectedProductIdx
                      ? 'ring-2 ring-indigo-500 opacity-100 scale-[1.05]'
                      : 'opacity-50 hover:opacity-80'
                  }`}
                  title={p.product?.name}
                >
                  {p.product?.imageUrl && !thumbErrors[p.id] ? (
                    <Image
                      src={p.product.imageUrl}
                      alt={p.product.name}
                      fill
                      className="object-cover"
                      sizes="64px"
                      onError={() => setThumbErrors(prev => ({ ...prev, [p.id]: true }))}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageOff size={20} className="text-white/25" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                    <p className="text-white/80 text-[9px] leading-tight truncate">{p.product?.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Thông tin chiến dịch dạng card nhỏ */}
          <div className="glass rounded-xl p-4 grid grid-cols-3 gap-3">
            {/* Thời lượng */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-indigo-400 mb-1">
                <Timer size={13} />
                <span className="text-xs font-medium">Thời lượng</span>
              </div>
              <p className="text-white text-sm font-bold">{durationHours}h</p>
            </div>
            {/* Sản phẩm */}
            <div className="text-center border-x border-white/10">
              <div className="flex items-center justify-center gap-1 text-indigo-400 mb-1">
                <Tag size={13} />
                <span className="text-xs font-medium">Sản phẩm</span>
              </div>
              <p className="text-white text-sm font-bold">
                {campaign.campaignProducts?.length ?? 0}
              </p>
            </div>
            {/* Tổng số lượng */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-indigo-400 mb-1">
                <BarChart3 size={13} />
                <span className="text-xs font-medium">Tổng SL</span>
              </div>
              <p className="text-white text-sm font-bold">
                {product?.saleQuantity ?? 0}
              </p>
            </div>
          </div>
        </div>

        {/* ────────────── RIGHT: Purchase Panel ────────────── */}
        <div className="md:sticky md:top-24 space-y-4">
          <div className="glass rounded-2xl p-6 space-y-5">

            {/* Merchant + Campaign status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
                >
                  {(campaign.merchant?.businessName ?? '?')[0].toUpperCase()}
                </div>
                <span className="font-medium text-white/70">
                  {campaign.merchant?.businessName}
                </span>
                <CheckCircle2 size={13} className="text-emerald-400" />
              </div>
              <StatusBadge status={campaign.status} />
            </div>

            {/* Tên sản phẩm / campaign */}
            <div>
              <h1 className="text-white text-xl font-bold leading-snug">
                {product?.product?.name ?? campaign.name}
              </h1>
              {product?.product?.name && product.product.name !== campaign.name && (
                <p className="text-white/40 text-xs mt-0.5">{campaign.name}</p>
              )}
            </div>

            {/* ── Khu vực thời gian ── */}
            {isActive && (
              <div className="glass rounded-xl p-4 space-y-3">
                {/* Countdown */}
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-sm flex items-center gap-1.5">
                    <Clock size={13} />
                    Kết thúc sau
                  </span>
                  <CountdownTimer targetDate={campaign.endTime} size="md" />
                </div>
                {/* Time progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-white/30 mb-1">
                    <span>{formatDate(campaign.startTime)}</span>
                    <span>{timeProgress}% đã trôi qua</span>
                    <span>{formatDate(campaign.endTime)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                      style={{ width: `${timeProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {isScheduled && (
              <div className="glass rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/50 text-sm">
                  <CalendarClock size={14} className="text-indigo-400" />
                  <span>Bắt đầu lúc</span>
                </div>
                <span className="text-indigo-300 text-sm font-semibold">
                  {formatDate(campaign.startTime)}
                </span>
              </div>
            )}

            {/* ── Khu vực giá ── */}
            {product && (
              <div className="space-y-3">
                {/* Giá + discount */}
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-white/30 text-sm line-through">
                    {formatCurrency(originalPrice)}
                  </span>
                  <span className="text-indigo-300 text-3xl font-black transition-all duration-300">
                    {formatCurrency(displayPrice)}
                  </span>
                  {wsPrice !== null && wsPrice !== product.salePrice && (
                    <span className="text-amber-300 text-xs font-medium flex items-center gap-1">
                      <TrendingDown size={12} />
                      Vừa cập nhật
                    </span>
                  )}
                </div>

                {/* Savings callout — nổi bật */}
                {savingsAmount > 0 && (
                  <div
                    className="rounded-xl px-4 py-2.5 flex items-center justify-between"
                    style={{
                      background: 'linear-gradient(135deg, rgba(79,70,229,0.15), rgba(124,58,237,0.15))',
                      border: '1px solid rgba(99,102,241,0.25)'
                    }}
                  >
                    <div className="flex items-center gap-2 text-indigo-300 text-sm">
                      <Tag size={14} />
                      <span>Bạn tiết kiệm được</span>
                    </div>
                    <span className="text-indigo-200 font-black text-base">
                      {formatCurrency(savingsAmount)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Khu vực tồn kho ── */}
            {product && (
              <div className="space-y-2">
                {/* Urgency banner */}
                {isActive && urgency === 'high' && !isSoldOut && (
                  <div className="flex items-center gap-2 text-red-400 text-xs font-semibold bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <Flame size={13} className="animate-pulse" />
                    <span>Chỉ còn {displayRemaining} sản phẩm — Sắp hết hàng!</span>
                  </div>
                )}
                {isActive && urgency === 'low' && !isSoldOut && (
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <Zap size={13} />
                    <span>Hàng đang bán chạy — còn {displayRemaining} sản phẩm</span>
                  </div>
                )}

                {/* Progress bar */}
                <StockProgressBar
                  remaining={displayRemaining}
                  total={product.saleQuantity}
                  showText={false}
                  size="md"
                  isLive={isLive}
                />

                {/* Đã bán vs còn lại */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/40 flex items-center gap-1">
                    <Users size={11} />
                    Đã bán:
                    <span
                      className="font-semibold ml-0.5"
                      style={{ color: soldCount > 0 ? '#a5b4fc' : undefined }}
                    >
                      {soldCount}
                    </span>
                    <span className="text-white/25">/ {product.saleQuantity}</span>
                  </span>
                  <span className="text-white/40 flex items-center gap-1">
                    Còn lại:
                    <span className={`font-semibold ml-0.5 ${
                      urgency === 'high' ? 'text-red-400' :
                      urgency === 'low'  ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>
                      {displayRemaining}
                    </span>
                    {isLive && !isSoldOut && (
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-live ml-1" />
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* ── Activity feed: giao dịch gần nhất (social proof) ──
                Chỉ hiển thị khi campaign đang ACTIVE + đang kết nối WebSocket
                + có ít nhất 1 giao dịch được nhận.
                Mỗi item tự fade out sau 8 giây (xử lý bởi usePurchaseActivity).
            */}
            {isLive && recentActivities.length > 0 && (
              <div className="space-y-1.5">
                {recentActivities.map(activity => (
                  <ActivityItem key={activity.id} purchasedAt={activity.purchasedAt} />
                ))}
              </div>
            )}

            {/* ── Pre-registration (SCHEDULED) ── */}
            {isScheduled && (
              <div className="glass rounded-xl p-3 flex items-center gap-3 border border-indigo-500/20">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(79,70,229,0.2)' }}
                >
                  <Users size={16} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-white/70 text-sm font-medium">Đăng ký nhắc nhở</p>
                  <p className="text-white/40 text-xs">Nhận thông báo khi chiến dịch bắt đầu</p>
                </div>
                {isPreRegistered === true && (
                  <CheckCircle2 size={18} className="text-emerald-400 ml-auto flex-shrink-0" />
                )}
              </div>
            )}

            {/* ── Quantity selector ── */}
            {product && product.perUserLimit > 1 && !isSoldOut && maxSelectableQuantity > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-white/50 text-sm">Số lượng:</span>
                <div className="flex items-center glass rounded-xl overflow-hidden">
                  <button
                    onClick={() => setQuantity(Math.max(1, effectiveQuantity - 1))}
                    className="px-3 py-2 text-white/50 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="px-4 py-2 text-white font-semibold min-w-[3rem] text-center">
                    {effectiveQuantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(maxSelectableQuantity, effectiveQuantity + 1))}
                    className="px-3 py-2 text-white/50 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <span className="text-white/30 text-xs">Tối đa {product.perUserLimit}</span>
              </div>
            )}

            {/* Đã đạt giới hạn */}
            {product && product.perUserLimit > 1 && maxSelectableQuantity <= 0 && !isSoldOut && (
              <div className="glass rounded-xl p-3 border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2">
                <Info size={14} />
                <span>
                  Đã đạt giới hạn mua ({alreadyPaidQuantity}/{product.perUserLimit} sản phẩm)
                </span>
              </div>
            )}

            {/* ── Pending reservation banner ── */}
            {hasPendingForSelectedProduct && pendingReservation && (
              <div className="glass rounded-xl p-4 border border-amber-500/30 bg-amber-500/10 space-y-3">
                <div className="flex items-center gap-2 text-amber-300">
                  <Clock size={15} />
                  <span className="text-sm font-semibold">Bạn có giữ chỗ chưa thanh toán</span>
                </div>
                <p className="text-white/50 text-xs">
                  Hết hạn lúc:{' '}
                  {new Date(pendingReservation.expiredAt).toLocaleTimeString('vi-VN')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      router.push(
                        `/checkout?reservationId=${pendingReservation.id}&expiredAt=${encodeURIComponent(pendingReservation.expiredAt)}`
                      )
                    }
                    className="btn-primary flex-1 text-sm py-2"
                  >
                    Tiếp tục thanh toán
                  </button>
                  <button
                    onClick={() => setPendingReservation(null)}
                    className="btn-glass text-sm py-2 px-3 text-white/40"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}

            {/* ── CTA buttons ── */}
            <div className="space-y-2">
              {/* ACTIVE + còn hàng + chưa giữ chỗ */}
              {isActive && !isSoldOut && !hasPendingForSelectedProduct && maxSelectableQuantity > 0 && (
                <button
                  onClick={handleBuy}
                  disabled={buyLoading}
                  className="btn-primary w-full disabled:opacity-50 py-3.5 text-base font-bold"
                >
                  {buyLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang đặt hàng...
                    </span>
                  ) : isAuthenticated
                    ? `Mua ngay — ${formatCurrency(displayPrice * effectiveQuantity)}`
                    : 'Đăng nhập để mua'
                  }
                </button>
              )}

              {/* SCHEDULED + đã đăng ký */}
              {isScheduled && isAuthenticated && isPreRegistered === true && (
                <button
                  onClick={handleCancelPreRegister}
                  disabled={cancelRegLoading}
                  className="btn-glass w-full disabled:opacity-50 border-indigo-500/40 text-indigo-300 py-3"
                >
                  {cancelRegLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang huỷ...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle2 size={15} />
                      Đã đăng ký nhắc nhở — Huỷ
                    </span>
                  )}
                </button>
              )}

              {/* SCHEDULED + chưa đăng ký */}
              {isScheduled && (!isAuthenticated || isPreRegistered !== true) && (
                <button
                  onClick={handlePreRegister}
                  disabled={regLoading}
                  className="btn-glass w-full disabled:opacity-50 py-3"
                >
                  {regLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang đăng ký...
                    </span>
                  ) : isAuthenticated ? (
                    <span className="flex items-center justify-center gap-2">
                      <Users size={15} />
                      Đăng ký nhận nhắc nhở
                    </span>
                  ) : 'Đăng nhập để nhận nhắc nhở'}
                </button>
              )}

              {/* Hết hàng / Đã kết thúc */}
              {(isEnded || isSoldOut) && (
                <button
                  disabled
                  className="w-full py-3.5 rounded-xl bg-white/5 text-white/25 cursor-not-allowed border border-white/10 font-medium"
                >
                  {isSoldOut ? '— Đã hết hàng —' : '— Chiến dịch đã kết thúc —'}
                </button>
              )}
            </div>

            {/* ── Per-user limit info ── */}
            {product && (
              <div className="flex items-center gap-2 text-white/30 text-xs border-t border-white/5 pt-4">
                <Info size={11} />
                <span>
                  Giới hạn {product.perUserLimit} sản phẩm/người.
                  {alreadyPaidQuantity > 0 && ` Bạn đã mua: ${alreadyPaidQuantity}.`}
                  {maxSelectableQuantity > 0 && ` Còn được mua: ${maxSelectableQuantity}.`}
                </span>
              </div>
            )}

            {/* ── Phương thức thanh toán ── */}
            <div className="flex items-center gap-3 border-t border-white/5 pt-4">
              <div className="flex items-center gap-1.5 text-white/30">
                <CreditCard size={13} />
                <span className="text-xs">Thanh toán:</span>
              </div>
              <div className="flex items-center gap-2">
                {PAYMENT_METHODS.map(pm => (
                  <span
                    key={pm.label}
                    className="text-white text-[10px] font-bold px-2 py-0.5 rounded"
                    style={{ background: pm.color + '30', border: `1px solid ${pm.color}50`, color: pm.color }}
                    title={pm.label}
                  >
                    {pm.abbr}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          Trust badges strip
          ══════════════════════════════════════════════ */}
      <div className="glass rounded-2xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-white/80 text-xs font-semibold">Merchant xác thực</p>
              <p className="text-white/30 text-[10px]">Đã kiểm tra KYC</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
              <Zap size={18} className="text-amber-400" />
            </div>
            <div>
              <p className="text-white/80 text-xs font-semibold">Flash Deal</p>
              <p className="text-white/30 text-[10px]">Giá chỉ trong chiến dịch</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
              <CreditCard size={18} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-white/80 text-xs font-semibold">Thanh toán an toàn</p>
              <p className="text-white/30 text-[10px]">VNPAY · MoMo · Stripe</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={18} className="text-violet-400" />
            </div>
            <div>
              <p className="text-white/80 text-xs font-semibold">Giá tốt nhất</p>
              <p className="text-white/30 text-[10px]">Đã so sánh thị trường</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          Tabs: Mô tả sản phẩm / Người bán
          ══════════════════════════════════════════════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex border-b border-white/10">
          {([
            ['desc', 'Mô tả sản phẩm'],
            ['seller', 'Người bán']
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'text-indigo-300 border-b-2 border-indigo-500 -mb-px'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'desc' ? (
            <div className="space-y-4">
              <p className="text-white/70 text-sm leading-relaxed">
                {campaign.description ?? 'Chưa có mô tả sản phẩm.'}
              </p>

              {/* Thông số sản phẩm dạng table */}
              {product && (
                <div className="space-y-2">
                  <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider">
                    Thông tin flash sale
                  </h3>
                  <div className="glass rounded-xl overflow-hidden">
                    {[
                      ['Giá gốc', formatCurrency(originalPrice)],
                      ['Giá sale', formatCurrency(displayPrice)],
                      ['Tiết kiệm', formatCurrency(savingsAmount) + ` (${discount}%)`],
                      ['Tổng số lượng', `${product.saleQuantity} sản phẩm`],
                      ['Đã bán', `${soldCount} sản phẩm`],
                      ['Còn lại', `${displayRemaining} sản phẩm`],
                      ['Giới hạn/người', `${product.perUserLimit} sản phẩm`],
                      ['Thời gian', `${formatDate(campaign.startTime)} — ${formatDate(campaign.endTime)}`]
                    ].map(([label, value], i) => (
                      <div
                        key={label}
                        className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                          i % 2 === 0 ? 'bg-white/[0.02]' : ''
                        }`}
                      >
                        <span className="text-white/40">{label}</span>
                        <span className={`text-white/80 font-medium ${
                          label === 'Tiết kiệm' ? 'text-indigo-300' : ''
                        }`}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Seller tab */
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-black flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
                >
                  {(campaign.merchant?.businessName ?? '?')[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-bold text-base">
                      {campaign.merchant?.businessName}
                    </p>
                    <span className="flex items-center gap-1 text-emerald-400 text-xs bg-emerald-400/10 px-2 py-0.5 rounded-full">
                      <CheckCircle2 size={11} />
                      Xác thực
                    </span>
                  </div>
                  <p className="text-white/40 text-sm">Nhà bán hàng đã được kiểm duyệt</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Chiến dịch này</p>
                  <p className="text-white font-bold">
                    {campaign.campaignProducts?.length ?? 0}
                  </p>
                  <p className="text-white/30 text-xs">sản phẩm</p>
                </div>
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Thời lượng</p>
                  <p className="text-white font-bold">{durationHours}h</p>
                  <p className="text-white/30 text-xs">flash sale</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
