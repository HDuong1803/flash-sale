'use client'

/**
 * StockProgressBar — Thanh tiến độ tồn kho với animation real-time.
 *
 * Props mới so với phiên bản cũ:
 * - isLive: true khi tồn kho đến từ WebSocket (hiện animation drop khi thay đổi)
 *
 * Animation flow:
 * 1. Khi `remaining` giảm → trigger class `animate-stock-drop` trên text số
 * 2. Progress bar transition smooth 700ms
 * 3. Animation tự xóa sau khi kết thúc (onAnimationEnd)
 *
 * Màu sắc:
 * - > 50%: xanh lá (emerald-500)
 * - 20-50%: vàng (yellow-500)
 * - < 20%: đỏ (red-500)
 * - Sold out: xám
 */

import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

interface StockProgressBarProps {
  remaining: number
  total: number
  showText?: boolean
  size?: 'sm' | 'md'
  /** true khi đang nhận update real-time từ WebSocket → hiện animation drop */
  isLive?: boolean
}

export function StockProgressBar({
  remaining,
  total,
  showText = false,
  size = 'md',
  isLive = false
}: StockProgressBarProps) {
  const percentage = total > 0 ? Math.max(0, (remaining / total) * 100) : 0
  const isSoldOut = remaining <= 0

  // Theo dõi khi remaining giảm để trigger animation
  const prevRemainingRef = useRef(remaining)
  const [isDropping, setIsDropping] = useState(false)

  useEffect(() => {
    // Chỉ trigger animation khi đang live mode VÀ tồn kho giảm
    if (isLive && remaining < prevRemainingRef.current) {
      setTimeout(() => setIsDropping(true), 0)
    }
    prevRemainingRef.current = remaining
  }, [remaining, isLive])

  const handleAnimationEnd = () => setIsDropping(false)

  // Màu progress bar theo ngưỡng
  const fillColor = isSoldOut
    ? 'bg-gray-600'
    : percentage > 50
    ? 'bg-emerald-500'
    : percentage > 20
    ? 'bg-yellow-500'
    : 'bg-red-500'

  // Glow effect theo ngưỡng tồn kho
  const glowStyle = isSoldOut
    ? {}
    : percentage > 50
    ? { boxShadow: '0 0 10px rgba(34,197,94,0.5)' }
    : percentage > 20
    ? { boxShadow: '0 0 10px rgba(234,179,8,0.5)' }
    : { boxShadow: '0 0 10px rgba(239,68,68,0.7)' }

  const trackHeight = size === 'sm' ? 'h-1.5' : 'h-2.5'

  return (
    <div className="w-full">
      <div className={cn('w-full rounded-full bg-white/10 relative overflow-hidden', trackHeight)}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            fillColor,
            isDropping && 'animate-bar-pulse'
          )}
          style={{ width: `${percentage}%`, ...glowStyle }}
        />
        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="glass-strong text-red-300 text-xs font-bold px-2 rounded">
              ĐÃ HẾT HÀNG
            </span>
          </div>
        )}
      </div>

      {showText && (
        <p className="text-white/60 text-xs mt-1 flex items-center gap-1">
          <span
            className={cn(isDropping && 'animate-stock-drop')}
            onAnimationEnd={handleAnimationEnd}
          >
            {remaining}
          </span>
          <span>còn lại / {total}</span>
          {/* Chấm xanh nhấp nháy khi đang nhận real-time update */}
          {isLive && !isSoldOut && (
            <span
              className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-live ml-1"
              title="Đang cập nhật trực tiếp"
            />
          )}
        </p>
      )}
    </div>
  )
}
