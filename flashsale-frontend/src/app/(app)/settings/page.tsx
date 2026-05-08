'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bell, Mail, Save, Loader2, Send,
  Wallet, AlertCircle, CheckCircle2, ExternalLink, RefreshCcw
} from 'lucide-react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/shared/GlassCard'
import { useNotificationPreferences } from '@/hooks/queries/useNotificationPreferences'
import { useTelegramLinkStatus } from '@/hooks/queries/useTelegramLinkStatus'
import { useUpdateNotificationPreferences } from '@/hooks/mutations/useUpdateNotificationPreferences'
import { useTelegramLinkActions } from '@/hooks/mutations/useTelegramLinkActions'
import { useStripeConnectStatus } from '@/hooks/queries/useStripeConnectStatus'
import { useStripeConnectActions } from '@/hooks/mutations/useStripeConnectActions'
import { useAuthContext } from '@/contexts/auth-context'
import type { NotificationPreferences, StripeAccountStatus } from '@/types'

// ─── Stripe Connect ───────────────────────────────────────────────────────────

type StatusView = { label: string; toneClass: string; description: string }

const STRIPE_STATUS_VIEW: Record<StripeAccountStatus, StatusView> = {
  NOT_CONNECTED: {
    label: 'Chưa kết nối',
    toneClass: 'text-white/70 border-white/20 bg-white/10',
    description: 'Tài khoản chưa liên kết Stripe. Checkout vẫn chạy bình thường và tiền sẽ về tài khoản nền tảng.',
  },
  PENDING: {
    label: 'Đang chờ hoàn tất',
    toneClass: 'text-amber-200 border-amber-400/30 bg-amber-500/15',
    description: 'Bạn đã bắt đầu onboarding nhưng chưa gửi đủ thông tin KYC hoặc payout.',
  },
  ACTIVE: {
    label: 'Đã kích hoạt',
    toneClass: 'text-emerald-200 border-emerald-500/30 bg-emerald-500/15',
    description: 'Merchant đã sẵn sàng nhận Destination Charges. Stripe sẽ payout theo chu kỳ mặc định.',
  },
  RESTRICTED: {
    label: 'Bị hạn chế',
    toneClass: 'text-orange-200 border-orange-500/30 bg-orange-500/15',
    description: 'Stripe đang yêu cầu bổ sung thông tin hoặc xác minh thêm trước khi cho phép nhận payout đầy đủ.',
  },
  DISABLED: {
    label: 'Đã vô hiệu hóa',
    toneClass: 'text-red-200 border-red-500/30 bg-red-500/15',
    description: 'Tài khoản bị Stripe vô hiệu hóa. Cần liên hệ support để mở lại hoặc tạo account mới.',
  },
}

function IndicatorRow({ label, active, activeText, inactiveText }: {
  label: string; active: boolean; activeText: string; inactiveText: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 flex items-center justify-between gap-3">
      <span className="text-sm text-white/70">{label}</span>
      <span className={[
        'text-xs px-2 py-0.5 rounded-full border',
        active
          ? 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10'
          : 'text-white/60 border-white/15 bg-white/5',
      ].join(' ')}>
        {active ? activeText : inactiveText}
      </span>
    </div>
  )
}

function StripeConnectCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handledRedirectKeyRef = useRef<string | null>(null)

  const {
    data: connectStatus, loading: statusLoading,
    error: statusError, refetch: refetchStatus,
  } = useStripeConnectStatus(true)

  const {
    initiateConnect, syncConnect, getDashboardLink, invalidateStatus,
    loadingConnect, loadingSync, loadingDashboard,
  } = useStripeConnectActions()

  const stripeRedirectState = searchParams.get('stripe')

  const clearRedirectQuery = useCallback(() => {
    router.replace('/settings', { scroll: false })
  }, [router])

  const openOnboarding = useCallback(async (reason: 'manual' | 'refresh') => {
    const result = await initiateConnect()
    if (!result.onboardingUrl) throw new Error('Stripe không trả về onboarding URL')
    if (reason === 'manual') toast.success('Đang chuyển đến Stripe onboarding')
    window.location.assign(result.onboardingUrl)
  }, [initiateConnect])

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

    if (stripeRedirectState === 'return') {
      void (async () => {
        try { await runSyncAfterReturn() } finally { clearRedirectQuery() }
      })()
      return
    }
    if (stripeRedirectState === 'refresh') {
      void (async () => {
        try { await openOnboarding('refresh') } finally { clearRedirectQuery() }
      })()
    }
  }, [clearRedirectQuery, openOnboarding, runSyncAfterReturn, searchParams, stripeRedirectState])

  const statusView = useMemo(
    () => STRIPE_STATUS_VIEW[connectStatus.status] ?? STRIPE_STATUS_VIEW.NOT_CONNECTED,
    [connectStatus.status]
  )
  const isBusy = loadingConnect || loadingSync || loadingDashboard

  return (
    <GlassCard className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
          <Wallet size={18} className="text-indigo-300" />
        </div>
        <div>
          <h2 className="text-white font-semibold">Stripe Connect</h2>
          <p className="text-white/40 text-xs">Quản lý kết nối thanh toán và payout cho cửa hàng.</p>
        </div>
      </div>

      {/* Status header */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-white/60 text-sm leading-relaxed">{statusView.description}</p>
        <span className={['text-xs px-2.5 py-1 rounded-full border whitespace-nowrap', statusView.toneClass].join(' ')}>
          {statusView.label}
        </span>
      </div>

      {/* Indicator rows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <IndicatorRow label="Khả năng nhận charge" active={connectStatus.chargesEnabled} activeText="Đã bật" inactiveText="Chưa bật" />
        <IndicatorRow label="Khả năng payout" active={connectStatus.payoutsEnabled} activeText="Đã bật" inactiveText="Chưa bật" />
      </div>

      {connectStatus.connectedAt && (
        <p className="text-white/40 text-xs">
          Kết nối lúc: {new Date(connectStatus.connectedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
        </p>
      )}

      {statusError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-300 mt-0.5 shrink-0" />
          <div>
            <p className="text-red-200 text-sm">{statusError}</p>
            <button onClick={refetchStatus} className="mt-1 text-xs text-red-200/90 hover:text-red-100 underline">
              Tải lại
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
        <button
          onClick={() => void openOnboarding('manual')}
          disabled={isBusy || statusLoading}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-50 flex items-center gap-2"
        >
          {loadingConnect ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
          {connectStatus.status === 'NOT_CONNECTED' ? 'Kết nối ngay' : 'Tạo lại link onboarding'}
        </button>

        <button
          onClick={() => void runSyncAfterReturn()}
          disabled={isBusy || statusLoading}
          className="btn-glass text-sm px-4 py-2 disabled:opacity-50"
        >
          {loadingSync ? 'Đang đồng bộ...' : 'Đồng bộ trạng thái'}
        </button>

        {connectStatus.status === 'ACTIVE' && (
          <button
            onClick={() => void getDashboardLink().then(r => window.open(r.url, '_blank', 'noopener,noreferrer'))}
            disabled={isBusy || statusLoading}
            className="btn-glass text-sm px-4 py-2 disabled:opacity-50 flex items-center gap-2"
          >
            {loadingDashboard ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
            Quản lý payout
          </button>
        )}
      </div>

      <div className="flex items-start gap-2 pt-1">
        <CheckCircle2 size={14} className="text-emerald-300 mt-0.5 shrink-0" />
        <p className="text-xs text-white/50">
          Nếu chưa kết nối, checkout vẫn thành công và tiền về tài khoản nền tảng để admin xử lý thủ công.
        </p>
      </div>
    </GlassCard>
  )
}

// ─── Notification settings ────────────────────────────────────────────────────

function ToggleRow({ icon, title, description, checked, onChange, disabled = false, loading = false }: {
  icon?: ReactNode; title: string; description: string
  checked: boolean; onChange: (value: boolean) => void
  disabled?: boolean; loading?: boolean
}) {
  const isDisabled = disabled || loading
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-white text-sm font-medium">{title}</p>
        </div>
        <p className="text-white/45 text-xs mt-1">{description}</p>
      </div>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={title}
        disabled={isDisabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-200',
          checked ? 'bg-indigo-500' : 'bg-white/25',
          isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span className={[
          'h-5 w-5 rounded-full bg-white transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')} />
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuthContext()
  const isMerchant = user?.role === 'MERCHANT'

  const { data, loading, error } = useNotificationPreferences()
  const { data: telegramStatus, loading: telegramLoading, error: telegramError, refetch: refetchTelegramStatus } = useTelegramLinkStatus()
  const { updatePreferences, loading: saving } = useUpdateNotificationPreferences()
  const { createLinkToken, unlinkTelegram, loadingCreateLink, loadingUnlink } = useTelegramLinkActions()
  const [draft, setDraft] = useState<NotificationPreferences>(data)

  useEffect(() => { setDraft(data) }, [data])

  const dirty = useMemo(() =>
    draft.notificationsEnabled !== data.notificationsEnabled ||
    draft.campaignReminderEnabled !== data.campaignReminderEnabled ||
    draft.orderStatusEnabled !== data.orderStatusEnabled ||
    draft.telegramEnabled !== data.telegramEnabled,
    [draft, data]
  )

  const setMaster = (value: boolean) => {
    setDraft(prev => ({
      notificationsEnabled: value,
      campaignReminderEnabled: value ? prev.campaignReminderEnabled : false,
      orderStatusEnabled: value ? prev.orderStatusEnabled : false,
      telegramEnabled: value ? prev.telegramEnabled : false,
    }))
  }

  const handleConnectTelegram = async () => {
    const token = await createLinkToken()
    window.open(token.deepLink, '_blank', 'noopener,noreferrer')
    toast.success('Đã mở Telegram bot. Gõ /start để hoàn tất liên kết.')
  }

  const handleUnlinkTelegram = async () => {
    await unlinkTelegram()
    setDraft(prev => ({ ...prev, telegramEnabled: false }))
    refetchTelegramStatus()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Cài đặt</h1>
        <p className="text-white/50 text-sm mt-1">Quản lý thông báo và các tuỳ chọn tài khoản.</p>
      </div>

      {/* Stripe Connect — chỉ merchant */}
      {isMerchant && <StripeConnectCard />}

      {/* Notifications */}
      <GlassCard className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <Bell size={18} className="text-indigo-300" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Thông báo</h2>
            <p className="text-white/40 text-xs">Ưu tiên cấu hình email trước khi tích hợp thêm kênh khác.</p>
          </div>
        </div>

        <ToggleRow
          icon={<Mail size={16} className="text-white/50" />}
          title="Bật thông báo qua email"
          description="Nhận thông báo hệ thống qua email đã đăng ký"
          checked={draft.notificationsEnabled}
          onChange={setMaster}
          loading={loading}
        />
        <ToggleRow
          title="Nhắc nhở chiến dịch đã đăng ký"
          description="Gửi email trước khi chiến dịch bắt đầu"
          checked={draft.campaignReminderEnabled}
          onChange={value => setDraft(prev => ({ ...prev, campaignReminderEnabled: value }))}
          disabled={!draft.notificationsEnabled || loading}
        />
        <ToggleRow
          title="Cập nhật trạng thái đơn hàng"
          description="Gửi email khi đơn hàng đổi trạng thái quan trọng"
          checked={draft.orderStatusEnabled}
          onChange={value => setDraft(prev => ({ ...prev, orderStatusEnabled: value }))}
          disabled={!draft.notificationsEnabled || loading}
        />

        {/* Telegram */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-white text-sm font-medium">Kết nối Telegram Bot</p>
              <p className="text-white/45 text-xs mt-1">Liên kết chat cá nhân để nhận thông báo theo tài khoản.</p>
            </div>
            <span className={[
              'text-[11px] px-2 py-1 rounded-full border',
              telegramStatus.linked
                ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                : 'text-white/60 border-white/15 bg-white/5'
            ].join(' ')}>
              {telegramStatus.linked ? 'Đã liên kết' : 'Chưa liên kết'}
            </span>
          </div>

          {telegramStatus.linked && (
            <p className="text-xs text-white/60">
              {telegramStatus.telegramFirstName || telegramStatus.telegramUsername
                ? `Đang liên kết với ${telegramStatus.telegramFirstName ?? ''}${telegramStatus.telegramUsername ? ` (@${telegramStatus.telegramUsername})` : ''}`
                : 'Đang liên kết Telegram'}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleConnectTelegram}
              disabled={loadingCreateLink || telegramLoading}
              className="btn-glass text-xs px-3 py-1.5 flex items-center gap-2 disabled:opacity-50"
            >
              {loadingCreateLink ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {telegramStatus.linked ? 'Kết nối lại Telegram' : 'Kết nối Telegram'}
            </button>
            {telegramStatus.linked && (
              <button
                onClick={handleUnlinkTelegram}
                disabled={loadingUnlink}
                className="btn-glass text-xs px-3 py-1.5 text-red-300 border-red-500/20 disabled:opacity-50"
              >
                {loadingUnlink ? 'Đang hủy...' : 'Hủy liên kết'}
              </button>
            )}
          </div>

          <ToggleRow
            title="Nhận thông báo qua Telegram"
            description="Gửi thông báo cá nhân vào Telegram bot đã liên kết"
            checked={draft.telegramEnabled}
            onChange={value => setDraft(prev => ({ ...prev, telegramEnabled: value }))}
            disabled={!draft.notificationsEnabled || !telegramStatus.linked || loading || telegramLoading}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {telegramError && <p className="text-red-400 text-sm">{telegramError}</p>}

        <div className="pt-2 border-t border-white/10 flex justify-end">
          <button
            onClick={() => void updatePreferences(draft)}
            disabled={saving || loading || !dirty}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </div>
      </GlassCard>
    </div>
  )
}
