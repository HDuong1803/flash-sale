import { cn } from '@/lib/utils'

interface StockProgressBarProps {
  remaining: number
  total: number
  showText?: boolean
  size?: 'sm' | 'md'
}

export function StockProgressBar({ remaining, total, showText = false, size = 'md' }: StockProgressBarProps) {
  const percentage = total > 0 ? (remaining / total) * 100 : 0
  const isSoldOut = remaining === 0

  const fillColor = isSoldOut
    ? 'bg-gray-600'
    : percentage > 50
    ? 'bg-emerald-500'
    : percentage > 20
    ? 'bg-yellow-500'
    : 'bg-red-500'

  const glowStyle = isSoldOut
    ? {}
    : percentage > 50
    ? { boxShadow: '0 0 10px rgba(34,197,94,0.5)' }
    : percentage > 20
    ? { boxShadow: '0 0 10px rgba(234,179,8,0.5)' }
    : { boxShadow: '0 0 10px rgba(239,68,68,0.5)' }

  const trackHeight = size === 'sm' ? 'h-1.5' : 'h-2.5'

  return (
    <div className="w-full">
      <div className={cn('w-full rounded-full bg-white/10 relative overflow-hidden', trackHeight)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', fillColor)}
          style={{ width: `${percentage}%`, ...glowStyle }}
        />
        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="glass-strong text-red-300 text-xs font-bold px-2 rounded">ĐÃ HẾT HÀNG</span>
          </div>
        )}
      </div>
      {showText && (
        <p className="text-white/60 text-xs mt-1">
          {remaining} còn lại / {total}
        </p>
      )}
    </div>
  )
}
