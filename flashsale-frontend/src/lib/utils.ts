import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

const VN_TZ = 'Asia/Ho_Chi_Minh'

/** dd/mm/yyyy HH:MM — dùng cho hầu hết hiển thị ngày giờ */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('vi-VN', {
    timeZone: VN_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** dd/mm/yyyy — chỉ ngày */
export function formatDateOnly(dateString: string): string {
  return new Date(dateString).toLocaleDateString('vi-VN', {
    timeZone: VN_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

/** dd/mm — ngày/tháng ngắn gọn (dùng cho chart) */
export function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString('vi-VN', {
    timeZone: VN_TZ,
    day: '2-digit', month: '2-digit',
  })
}

/** HH:MM — chỉ giờ phút */
export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('vi-VN', {
    timeZone: VN_TZ,
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatTimeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  return `${Math.floor(hrs / 24)} ngày trước`
}

/**
 * Định dạng số tiền gọn cho trục/nhãn biểu đồ.
 * Ví dụ: 30_000_000 → "30tr" | 1_500_000 → "1.5tr" | 500_000 → "500K" | 12_000 → "12K"
 */
export function formatChartMoney(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}tỷ`
  if (v >= 1_000_000) {
    const n = v / 1_000_000
    return `${Number.isInteger(n) ? n : n.toFixed(1)}tr`
  }
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`
  return v.toLocaleString('vi-VN')
}

export function calculateDiscount(original: number, sale: number): number {
  return Math.round(((original - sale) / original) * 100)
}

export function maskString(str: string): string {
  return str.replace(/\B\w/g, '*')
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
