'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Calendar,
  CreditCard,
  Mail,
  MessageCircle,
  Package,
  ShoppingBag,
  ShoppingCart,
  Star,
  TrendingUp,
  User,
} from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useAdminUserDetail } from '@/hooks/queries/useAdminUserDetail'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { UserRole, UserStatus } from '@/types'

const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: 'Khách hàng',
  MERCHANT: 'Người bán',
  ADMIN: 'Quản trị viên',
}

const ROLE_COLORS: Record<UserRole, string> = {
  CUSTOMER: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  MERCHANT: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20',
  ADMIN: 'bg-red-500/15 text-red-300 border-red-500/20',
}

const STATUS_COLORS: Record<UserStatus, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  INACTIVE: 'bg-white/5 text-white/40 border-white/10',
  BANNED: 'bg-red-500/15 text-red-300 border-red-500/20',
}

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Không hoạt động',
  BANNED: 'Đã đình chỉ',
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'indigo',
}: {
  label: string
  value: string
  hint?: string
  icon: typeof TrendingUp
  accent?: 'indigo' | 'emerald' | 'amber' | 'red' | 'blue'
}) {
  const accentColors = {
    indigo: 'text-indigo-300/70',
    emerald: 'text-emerald-300/70',
    amber: 'text-amber-300/70',
    red: 'text-red-300/70',
    blue: 'text-blue-300/70',
  }
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-xs uppercase tracking-wide">{label}</p>
        <Icon className={accentColors[accent]} size={16} />
      </div>
      <p className="text-white text-2xl font-bold mt-2">{value}</p>
      {hint && <p className="text-white/40 text-xs mt-1">{hint}</p>}
    </GlassCard>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-white/45 text-xs uppercase tracking-wide mb-1">{label}</p>
      <div className="text-white text-sm">{value ?? <span className="text-white/30">—</span>}</div>
    </div>
  )
}

function OrderBreakdownBar({
  pending, confirmed, shipping, done, cancelled,
}: {
  pending: number; confirmed: number; shipping: number; done: number; cancelled: number
}) {
  const total = pending + confirmed + shipping + done + cancelled
  if (total === 0) return <p className="text-white/40 text-sm">Chưa có đơn hàng nào.</p>

  const segments = [
    { label: 'Chờ xử lý', value: pending, color: 'bg-yellow-400' },
    { label: 'Đã xác nhận', value: confirmed, color: 'bg-blue-400' },
    { label: 'Đang giao', value: shipping, color: 'bg-purple-400' },
    { label: 'Hoàn thành', value: done, color: 'bg-emerald-400' },
    { label: 'Đã hủy', value: cancelled, color: 'bg-red-400' },
  ].filter(s => s.value > 0)

  return (
    <div className="space-y-3">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {segments.map(s => (
          <div
            key={s.label}
            className={`${s.color} transition-all`}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-white/60">
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            {s.label}: <span className="text-white font-medium">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminUserDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const userId = useMemo(() => {
    if (!params?.id) return ''
    return Array.isArray(params.id) ? params.id[0] : params.id
  }, [params])

  const { data, loading, error, refetch } = useAdminUserDetail(userId)

  if (!userId) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="text-white/70">User ID không hợp lệ.</p>
      </GlassCard>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 rounded-2xl bg-white/5 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <GlassCard className="p-10 text-center space-y-3">
        <AlertCircle className="mx-auto text-red-400" size={36} />
        <p className="text-red-300 text-sm">{error}</p>
        <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
      </GlassCard>
    )
  }

  if (!data) return null

  const initials = data.fullName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <div className="space-y-6">
      {/* Header breadcrumbs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (window.history.length > 1) { router.back(); return }
            router.push('/admin/users')
          }}
          className="btn-glass text-xs px-3 py-1.5 inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={13} />
          Quay lại
        </button>
        <Link href="/admin/users" className="btn-glass text-xs px-3 py-1.5">
          Danh sách người dùng
        </Link>
      </div>

      {/* Identity header */}
      <GlassCard className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
          >
            {initials || <User size={28} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-white text-xl font-bold">{data.fullName}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${ROLE_COLORS[data.role]}`}>
                {ROLE_LABELS[data.role]}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[data.status]}`}>
                {STATUS_LABELS[data.status]}
              </span>
              {data.emailVerified && (
                <span className="text-xs px-2.5 py-1 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                  ✓ Email xác thực
                </span>
              )}
            </div>
            <p className="text-white/50 text-sm flex items-center gap-1.5">
              <Mail size={13} />
              {data.email}
            </p>
            <p className="text-white/30 text-xs mt-1 font-mono">{data.id}</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <p className="text-white/40 text-xs">Tham gia</p>
            <p className="text-white/70 text-sm">{formatDate(data.createdAt)}</p>
            {data.lastLoginAt && (
              <>
                <p className="text-white/40 text-xs mt-1">Đăng nhập gần nhất</p>
                <p className="text-white/70 text-sm">{formatDate(data.lastLoginAt)}</p>
              </>
            )}
          </div>
        </div>
      </GlassCard>

      {/* KPI stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Tổng đơn hàng"
          value={data.totalOrders.toLocaleString()}
          hint={`Hoàn thành ${data.completedOrders}`}
          icon={ShoppingCart}
          accent="blue"
        />
        <KpiCard
          label="Tổng chi tiêu"
          value={formatCurrency(data.totalSpend)}
          hint={`TB ${formatCurrency(data.avgOrderValue)}/đơn`}
          icon={CreditCard}
          accent="emerald"
        />
        <KpiCard
          label="Đơn hủy"
          value={data.cancelledOrders.toLocaleString()}
          hint={`${data.totalOrders > 0 ? Math.round((data.cancelledOrders / data.totalOrders) * 100) : 0}% tổng đơn`}
          icon={Package}
          accent="red"
        />
        <KpiCard
          label="30 ngày qua"
          value={data.purchasesLast30Days.toLocaleString()}
          hint="Đơn hàng"
          icon={TrendingUp}
          accent="indigo"
        />
        <KpiCard
          label="90 ngày qua"
          value={data.purchasesLast90Days.toLocaleString()}
          hint="Đơn hàng"
          icon={TrendingUp}
          accent="amber"
        />
        <KpiCard
          label="Chưa đọc"
          value={data.unreadNotifications.toLocaleString()}
          hint="Thông báo"
          icon={Bell}
          accent="indigo"
        />
      </div>

      {/* Order breakdown */}
      <GlassCard className="p-5 space-y-4">
        <h2 className="text-white font-semibold text-base flex items-center gap-2">
          <ShoppingBag size={17} className="text-indigo-300" />
          Phân bố trạng thái đơn hàng
        </h2>
        <OrderBreakdownBar
          pending={data.ordersPending}
          confirmed={data.ordersConfirmed}
          shipping={data.ordersShipping}
          done={data.ordersDone}
          cancelled={data.ordersCancelled}
        />
      </GlassCard>

      {/* Profile + Telegram + Notifications */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-5 space-y-4">
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <User size={16} className="text-indigo-300" />
            Thông tin cá nhân
          </h2>
          <div className="space-y-3">
            <InfoRow label="Họ tên" value={data.fullName} />
            <InfoRow label="Email" value={data.email} />
            <InfoRow label="Số điện thoại" value={data.phone} />
            <InfoRow
              label="Địa chỉ mặc định"
              value={data.defaultAddress ? (
                <span className="text-white/80 leading-relaxed">{data.defaultAddress}</span>
              ) : null}
            />
            <InfoRow
              label="Đơn đầu tiên"
              value={data.firstOrderAt ? formatDate(data.firstOrderAt) : null}
            />
            <InfoRow
              label="Đơn gần nhất"
              value={data.lastOrderAt ? formatDate(data.lastOrderAt) : null}
            />
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-4">
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <MessageCircle size={16} className="text-blue-300" />
            Telegram
          </h2>
          {data.telegramLinked ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-live" />
                <span className="text-emerald-300 text-sm font-medium">Đã liên kết</span>
              </div>
              <InfoRow
                label="Tên người dùng"
                value={data.telegramUsername ? `@${data.telegramUsername}` : '—'}
              />
              <InfoRow
                label="Thời gian liên kết"
                value={data.telegramLinkedAt ? formatDate(data.telegramLinkedAt) : null}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2">
              <span className="w-2 h-2 bg-white/25 rounded-full" />
              <span className="text-white/40 text-sm">Chưa liên kết Telegram</span>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5 space-y-4">
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <Bell size={16} className="text-amber-300" />
            Cài đặt thông báo
          </h2>
          <div className="space-y-2.5">
            {[
              { label: 'Thông báo in-app', enabled: data.notificationsEnabled },
              { label: 'Nhắc chiến dịch', enabled: data.campaignReminderEnabled },
              { label: 'Cập nhật đơn hàng', enabled: data.orderStatusEnabled },
              { label: 'Telegram', enabled: data.telegramEnabled },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-white/60 text-sm">{item.label}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    item.enabled
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-white/5 text-white/30'
                  }`}
                >
                  {item.enabled ? 'Bật' : 'Tắt'}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Top campaigns */}
      {data.topCampaigns.length > 0 && (
        <GlassCard className="p-5 space-y-4">
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <Star size={16} className="text-amber-300" />
            Chiến dịch mua nhiều nhất
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['#', 'Chiến dịch', 'Nhà bán hàng', 'Số đơn', 'Tổng chi tiêu'].map(h => (
                    <th key={h} className="py-2 pr-4 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.topCampaigns.map((item, i) => (
                  <tr key={item.campaignId} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="py-3 pr-4 text-white/40 text-xs font-mono">#{i + 1}</td>
                    <td className="py-3 pr-4">
                      <p className="text-white">{item.campaignName}</p>
                      <p className="text-white/30 text-xs font-mono">{item.campaignId.slice(0, 12)}...</p>
                    </td>
                    <td className="py-3 pr-4 text-white/60">{item.merchantName}</td>
                    <td className="py-3 pr-4">
                      <span className="text-white font-medium">{item.orderCount}</span>
                      <span className="text-white/40 text-xs ml-1">đơn</span>
                    </td>
                    <td className="py-3 pr-4 text-emerald-300 font-semibold">
                      {formatCurrency(item.totalSpend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Recent orders */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <ShoppingCart size={16} className="text-indigo-300" />
            Đơn hàng gần nhất
          </h2>
          <span className="text-white/40 text-xs">{data.recentOrders.length} đơn</span>
        </div>
        {data.recentOrders.length === 0 ? (
          <p className="text-white/40 text-sm py-4 text-center">Chưa có đơn hàng nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Mã đơn', 'Chiến dịch', 'Nhà bán', 'Trạng thái', 'Thanh toán', 'Giá trị', 'Thời gian'].map(h => (
                    <th key={h} className="py-2 pr-3 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map(order => (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="py-3 pr-3">
                      <p className="text-white font-mono text-xs">{order.id.slice(0, 12)}...</p>
                      <p className="text-white/30 text-xs">{order.itemCount} sản phẩm</p>
                    </td>
                    <td className="py-3 pr-3">
                      {order.campaignName ? (
                        <>
                          <p className="text-white/80 text-xs leading-relaxed line-clamp-2">{order.campaignName}</p>
                          {order.campaignStatus && (
                            <StatusBadge status={order.campaignStatus} className="mt-1 text-[10px]" />
                          )}
                        </>
                      ) : <span className="text-white/30">—</span>}
                    </td>
                    <td className="py-3 pr-3 text-white/60 text-xs">{order.merchantName}</td>
                    <td className="py-3 pr-3"><StatusBadge status={order.status} /></td>
                    <td className="py-3 pr-3">
                      {order.paymentStatus
                        ? <StatusBadge status={order.paymentStatus} />
                        : <span className="text-white/30 text-xs">—</span>}
                    </td>
                    <td className="py-3 pr-3 text-white font-semibold">{formatCurrency(order.totalAmount)}</td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-1 text-white/40 text-xs">
                        <Calendar size={11} />
                        {formatDate(order.createdAt)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Pre-registrations */}
      {data.preRegistrations.length > 0 && (
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-base flex items-center gap-2">
              <Calendar size={16} className="text-purple-300" />
              Đăng ký trước chiến dịch
            </h2>
            <span className="text-white/40 text-xs">{data.preRegistrations.length} chiến dịch</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.preRegistrations.map(reg => (
              <div key={reg.id} className="glass rounded-xl p-3 space-y-2">
                <p className="text-white text-sm font-medium line-clamp-2">{reg.campaignName}</p>
                <StatusBadge status={reg.campaignStatus} />
                <div className="text-white/40 text-xs space-y-0.5">
                  <p>Bắt đầu: {formatDate(reg.campaignStartTime)}</p>
                  <p>Kết thúc: {formatDate(reg.campaignEndTime)}</p>
                  <p className="text-white/25">Đăng ký: {formatDate(reg.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}
