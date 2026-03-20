import { cn } from '@/lib/utils'
import type { CampaignStatus, ReservationStatus, OrderStatus, PaymentStatus, KycStatus } from '@/types'

type StatusType = CampaignStatus | ReservationStatus | OrderStatus | PaymentStatus | KycStatus

const statusConfig: Record<string, { bg: string; border: string; text: string; dot: string; animate?: boolean }> = {
  DRAFT:     { bg: 'bg-white/10',         border: 'border-white/20',          text: 'text-white/60',    dot: 'bg-gray-400' },
  APPROVED:  { bg: 'bg-emerald-500/15',   border: 'border-emerald-500/30',    text: 'text-emerald-300', dot: 'bg-emerald-400' },
  SCHEDULED: { bg: 'bg-purple-500/15',    border: 'border-purple-500/30',     text: 'text-purple-300',  dot: 'bg-purple-400' },
  ACTIVE:    { bg: 'bg-emerald-500/15',   border: 'border-emerald-500/30',    text: 'text-emerald-300', dot: 'bg-emerald-400', animate: true },
  ENDED:     { bg: 'bg-white/5',          border: 'border-white/10',          text: 'text-white/40',    dot: 'bg-gray-500' },
  HOLDING:   { bg: 'bg-blue-500/15',      border: 'border-blue-500/20',       text: 'text-blue-300',    dot: 'bg-blue-400', animate: true },
  PAID:      { bg: 'bg-emerald-500/15',   border: 'border-emerald-500/20',    text: 'text-emerald-300', dot: 'bg-emerald-400' },
  EXPIRED:   { bg: 'bg-white/5',          border: 'border-white/10',          text: 'text-white/40',    dot: 'bg-gray-500' },
  PENDING:   { bg: 'bg-yellow-500/15',    border: 'border-yellow-500/30',     text: 'text-yellow-300',  dot: 'bg-yellow-400' },
  CONFIRMED: { bg: 'bg-blue-500/15',      border: 'border-blue-500/20',       text: 'text-blue-300',    dot: 'bg-blue-400' },
  SHIPPING:  { bg: 'bg-purple-500/15',    border: 'border-purple-500/20',     text: 'text-purple-300',  dot: 'bg-purple-400' },
  DONE:      { bg: 'bg-emerald-500/15',   border: 'border-emerald-500/20',    text: 'text-emerald-300', dot: 'bg-emerald-400' },
  CANCELLED: { bg: 'bg-red-500/15',       border: 'border-red-500/20',        text: 'text-red-300',     dot: 'bg-red-400' },
  SUCCESS:   { bg: 'bg-emerald-500/15',   border: 'border-emerald-500/20',    text: 'text-emerald-300', dot: 'bg-emerald-400' },
  FAILED:    { bg: 'bg-red-500/15',       border: 'border-red-500/20',        text: 'text-red-300',     dot: 'bg-red-400' },
  REFUNDED:  { bg: 'bg-orange-500/15',    border: 'border-orange-500/20',     text: 'text-orange-300',  dot: 'bg-orange-400' },
  REJECTED:  { bg: 'bg-red-500/15',       border: 'border-red-500/20',        text: 'text-red-300',     dot: 'bg-red-400' },
  INACTIVE:  { bg: 'bg-white/5',          border: 'border-white/10',          text: 'text-white/40',    dot: 'bg-gray-500' },
}

interface StatusBadgeProps {
  status: StatusType | string
  className?: string
}

const statusLabels: Record<string, string> = {
  DRAFT: 'Nháp', APPROVED: 'Đã duyệt', SCHEDULED: 'Đã lên lịch', ACTIVE: 'Đang diễn ra', ENDED: 'Đã kết thúc',
  HOLDING: 'Đang giữ', PAID: 'Đã thanh toán', EXPIRED: 'Hết hạn',
  PENDING: 'Chờ xử lý', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao', DONE: 'Hoàn thành', CANCELLED: 'Đã hủy',
  SUCCESS: 'Thành công', FAILED: 'Thất bại', REFUNDED: 'Hoàn tiền',
  REJECTED: 'Từ chối', INACTIVE: 'Không hoạt động',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig['DRAFT']
  const label = statusLabels[status] ?? status
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
      config.bg, config.border, config.text, className
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot, config.animate && 'animate-live')} />
      {label}
    </span>
  )
}
