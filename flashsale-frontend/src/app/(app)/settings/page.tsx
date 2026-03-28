'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bell, Mail, Save, Loader2 } from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { useNotificationPreferences } from '@/hooks/queries/useNotificationPreferences'
import { useUpdateNotificationPreferences } from '@/hooks/mutations/useUpdateNotificationPreferences'
import type { NotificationPreferences } from '@/types'

export default function SettingsPage() {
  const { data, loading, error } = useNotificationPreferences()
  const { updatePreferences, loading: saving } = useUpdateNotificationPreferences()
  const [draft, setDraft] = useState<NotificationPreferences>(data)

  useEffect(() => {
    setDraft(data)
  }, [data])

  const dirty = useMemo(
    () =>
      draft.notificationsEnabled !== data.notificationsEnabled ||
      draft.campaignReminderEnabled !== data.campaignReminderEnabled ||
      draft.orderStatusEnabled !== data.orderStatusEnabled,
    [draft, data],
  )

  const handleSave = async () => {
    await updatePreferences(draft)
  }

  const setMaster = (value: boolean) => {
    setDraft((prev) => ({
      notificationsEnabled: value,
      campaignReminderEnabled: value ? prev.campaignReminderEnabled : false,
      orderStatusEnabled: value ? prev.orderStatusEnabled : false,
    }))
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Cài đặt</h1>
        <p className="text-white/50 text-sm mt-1">
          Quản lý cấu hình thông báo và các tuỳ chọn cá nhân.
        </p>
      </div>

      <GlassCard className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <Bell size={18} className="text-indigo-300" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Thông báo bên ngoài</h2>
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
          onChange={(value) =>
            setDraft((prev) => ({ ...prev, campaignReminderEnabled: value }))
          }
          disabled={!draft.notificationsEnabled || loading}
        />

        <ToggleRow
          title="Cập nhật trạng thái đơn hàng"
          description="Gửi email khi đơn hàng đổi trạng thái quan trọng"
          checked={draft.orderStatusEnabled}
          onChange={(value) =>
            setDraft((prev) => ({ ...prev, orderStatusEnabled: value }))
          }
          disabled={!draft.notificationsEnabled || loading}
        />

        {error && (
          <p className="text-red-400 text-sm">
            {error}
          </p>
        )}

        <div className="pt-2 border-t border-white/10 flex justify-end">
          <button
            onClick={handleSave}
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

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
  disabled = false,
  loading = false,
}: {
  icon?: ReactNode
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  loading?: boolean
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
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={isDisabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-200',
          checked ? 'bg-indigo-500' : 'bg-white/25',
          isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span
          className={[
            'h-5 w-5 rounded-full bg-white transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
