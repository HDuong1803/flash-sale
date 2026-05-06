'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCcw, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/shared/GlassCard'
import { useStripeConnectStatus } from '@/hooks/queries/useStripeConnectStatus'
import { useStripeConnectActions } from '@/hooks/mutations/useStripeConnectActions'
import type { StripeAccountStatus } from '@/types'

type StatusView = {
  label: string
  toneClass: string
  description: string
}

const STATUS_VIEW: Record<StripeAccountStatus, StatusView> = {
  NOT_CONNECTED: {
    label: 'Chưa kết nối',
    toneClass: 'text-white/70 border-white/20 bg-white/10',
    description:
      'Tài khoản chưa liên kết Stripe. Checkout vẫn chạy bình thường và tiền sẽ về tài khoản platform.',
  },
  PENDING: {
    label: 'Đang chờ hoàn tất',
    toneClass: 'text-amber-200 border-amber-400/30 bg-amber-500/15',
    description:
      'Bạn đã bắt đầu onboarding nhưng chưa gửi đủ thông tin KYC hoặc payout.',
  },
  ACTIVE: {
    label: 'Đã kích hoạt',
    toneClass: 'text-emerald-200 border-emerald-500/30 bg-emerald-500/15',
    description:
      'Merchant đã sẵn sàng nhận Destination Charges. Stripe sẽ payout theo chu kỳ mặc định.',
  },
  RESTRICTED: {
    label: 'Bị hạn chế',
    toneClass: 'text-orange-200 border-orange-500/30 bg-orange-500/15',
    description:
      'Stripe đang yêu cầu bổ sung thông tin hoặc xác minh thêm trước khi cho phép nhận payout đầy đủ.',
  },
  DISABLED: {
    label: 'Đã vô hiệu hóa',
    toneClass: 'text-red-200 border-red-500/30 bg-red-500/15',
    description:
      'Tài khoản bị Stripe vô hiệu hóa. Cần liên hệ support để mở lại hoặc tạo account mới theo hướng dẫn admin.',
  },
}

export default function MerchantSettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handledRedirectKeyRef = useRef<string | null>(null)

  const {
    data: connectStatus,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useStripeConnectStatus(true)

  const {
    initiateConnect,
    syncConnect,
    getDashboardLink,
    invalidateStatus,
    loadingConnect,
    loadingSync,
    loadingDashboard,
  } = useStripeConnectActions()

  const stripeRedirectState = searchParams.get('stripe')

  const clearRedirectQuery = useCallback(() => {
    router.replace('/merchant/settings', { scroll: false })
  }, [router])

  const openOnboarding = useCallback(
    async (reason: 'manual' | 'refresh') => {
      const result = await initiateConnect()
      if (!result.onboardingUrl) {
        throw new Error('Stripe không trả về onboarding URL')
      }

      if (reason === 'manual') {
        toast.success('Đang chuyển đến Stripe onboarding')
      }

      // Redirect bằng full-page navigation để Stripe nhận đúng return_url/refresh_url.
      window.location.assign(result.onboardingUrl)
    },
    [initiateConnect]
  )

  const runSyncAfterReturn = useCallback(async () => {
    const result = await syncConnect()
    await invalidateStatus()

    if (result.status === 'ACTIVE') {
      toast.success('Kết nối Stripe thành công. Merchant đã sẵn sàng nhận payout.')
      return
    }

    if (result.status === 'PENDING' || result.status === 'RESTRICTED') {
      toast.info('Stripe cần thêm thông tin. Vui lòng tiếp tục onboarding để hoàn tất.')
      return
    }

    toast.warning('Trạng thái Stripe đã được cập nhật.')
  }, [invalidateStatus, syncConnect])

  useEffect(() => {
    if (!stripeRedirectState) return

    const redirectKey = `${stripeRedirectState}:${searchParams.toString()}`
    if (handledRedirectKeyRef.current === redirectKey) return
    handledRedirectKeyRef.current = redirectKey

    // Query param từ Stripe phải được xử lý một lần duy nhất để tránh loop gọi API.
    if (stripeRedirectState === 'return') {
      void (async () => {
        try {
          await runSyncAfterReturn()
        } finally {
          clearRedirectQuery()
        }
      })()
      return
    }

    // refresh = account link hết hạn hoặc merchant bấm quay lại từ Stripe form.
    // Ta tạo link mới ngay để merchant tiếp tục onboarding mượt mà.
    if (stripeRedirectState === 'refresh') {
      void (async () => {
        try {
          await openOnboarding('refresh')
        } finally {
          clearRedirectQuery()
        }
      })()
    }
  }, [
    clearRedirectQuery,
    openOnboarding,
    runSyncAfterReturn,
    searchParams,
    stripeRedirectState,
  ])

  const statusView = useMemo(
    () => STATUS_VIEW[connectStatus.status] ?? STATUS_VIEW.NOT_CONNECTED,
    [connectStatus.status]
  )

  const canOpenDashboard = connectStatus.status === 'ACTIVE'
  const handleConnectClick = async () => {
    await openOnboarding('manual')
  }

  const handleOpenDashboard = async () => {
    const result = await getDashboardLink()
    window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  const isBusy = loadingConnect || loadingSync || loadingDashboard

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Cài đặt Stripe Connect</h1>
        <p className="text-white/50 text-sm mt-1">
          Quản lý kết nối payout cho cửa hàng. Checkout luôn hoạt động kể cả khi chưa kết nối Stripe.
        </p>
      </div>

      <GlassCard className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
              <Wallet size={18} className="text-indigo-300" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Trạng thái kết nối</h2>
              <p className="text-white/45 text-xs mt-1">{statusView.description}</p>
            </div>
          </div>

          <span
            className={[
              'text-xs px-2.5 py-1 rounded-full border whitespace-nowrap',
              statusView.toneClass,
            ].join(' ')}
          >
            {statusView.label}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <IndicatorRow
            label="Khả năng nhận charge"
            active={connectStatus.chargesEnabled}
            activeText="Đã bật"
            inactiveText="Chưa bật"
          />
          <IndicatorRow
            label="Khả năng payout"
            active={connectStatus.payoutsEnabled}
            activeText="Đã bật"
            inactiveText="Chưa bật"
          />
        </div>

        {connectStatus.connectedAt ? (
          <p className="text-white/45 text-xs">
            Thời điểm kết nối thành công: {new Date(connectStatus.connectedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
          </p>
        ) : null}

        {statusError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-300 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-red-200 text-sm">{statusError}</p>
              <button
                onClick={refetchStatus}
                className="mt-2 text-xs text-red-200/90 hover:text-red-100 underline"
              >
                Tải lại trạng thái
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
          <button
            onClick={handleConnectClick}
            disabled={isBusy || statusLoading}
            className="btn-primary text-sm px-4 py-2 disabled:opacity-50 flex items-center gap-2"
          >
            {loadingConnect ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            {connectStatus.status === 'NOT_CONNECTED' ? 'Kết nối ngay' : 'Tạo lại link onboarding'}
          </button>

          <button
            onClick={() => {
              void runSyncAfterReturn()
            }}
            disabled={isBusy || statusLoading}
            className="btn-glass text-sm px-4 py-2 disabled:opacity-50"
          >
            {loadingSync ? 'Đang đồng bộ...' : 'Đồng bộ trạng thái'}
          </button>

          {canOpenDashboard ? (
            <button
              onClick={handleOpenDashboard}
              disabled={isBusy || statusLoading}
              className="btn-glass text-sm px-4 py-2 disabled:opacity-50 flex items-center gap-2"
            >
              {loadingDashboard ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
              Quản lý payout
            </button>
          ) : null}
        </div>
      </GlassCard>

      <GlassCard className="p-5 space-y-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={16} className="text-emerald-300 mt-0.5" />
          <p className="text-sm text-white/75">
            Fallback an toàn: nếu chưa ACTIVE, checkout vẫn thành công và tiền về platform account để admin xử lý payout thủ công.
          </p>
        </div>
        <p className="text-xs text-white/45">
          Điều này đảm bảo không bao giờ block doanh thu chỉ vì merchant chưa hoàn tất onboarding Stripe.
        </p>
      </GlassCard>
    </div>
  )
}

function IndicatorRow({
  label,
  active,
  activeText,
  inactiveText,
}: {
  label: string
  active: boolean
  activeText: string
  inactiveText: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 flex items-center justify-between gap-3">
      <span className="text-sm text-white/70">{label}</span>
      <span
        className={[
          'text-xs px-2 py-0.5 rounded-full border',
          active
            ? 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10'
            : 'text-white/60 border-white/15 bg-white/5',
        ].join(' ')}
      >
        {active ? activeText : inactiveText}
      </span>
    </div>
  )
}
