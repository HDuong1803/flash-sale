'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useCountdown } from '@/hooks/useCountdown'

interface CountdownTimerProps {
  targetDate: string
  size?: 'sm' | 'md' | 'lg'
  onExpire?: () => void
  showDays?: boolean
}

const sizeConfig = {
  sm: { text: 'text-sm', h: 'h-8', w: 'w-7', sep: 'text-xs' },
  md: { text: 'text-2xl', h: 'h-12', w: 'w-10', sep: 'text-base' },
  lg: { text: 'text-5xl', h: 'h-20', w: 'w-16', sep: 'text-3xl' },
}

function DigitBox({ value, size }: { value: string; size: 'sm' | 'md' | 'lg' }) {
  const s = sizeConfig[size]
  return (
    <div className={cn('glass rounded-lg flex items-center justify-center font-mono font-bold', s.h, s.w, s.text)}>
      {value}
    </div>
  )
}

function Separator({ size }: { size: 'sm' | 'md' | 'lg' }) {
  return <span className={cn('text-white/40 font-bold', sizeConfig[size].sep)}>:</span>
}

function pad(n: number) { return String(n).padStart(2, '0') }

export function CountdownTimer({ targetDate, size = 'md', onExpire, showDays = false }: CountdownTimerProps) {
  const { days, hours, minutes, seconds, isExpired, totalSeconds } = useCountdown(targetDate)

  useEffect(() => {
    if (isExpired) onExpire?.()
  }, [isExpired, onExpire])

  const colorClass =
    isExpired || totalSeconds < 60
      ? 'text-red-400 animate-live'
      : totalSeconds < 600
      ? 'text-red-400'
      : totalSeconds < 3600
      ? 'text-indigo-300'
      : 'text-white/90'

  return (
    <div className={cn('flex items-center gap-1', colorClass)}>
      {showDays && days > 0 && (
        <>
          <DigitBox value={pad(days)} size={size} />
          <Separator size={size} />
        </>
      )}
      <DigitBox value={pad(hours)} size={size} />
      <Separator size={size} />
      <DigitBox value={pad(minutes)} size={size} />
      <Separator size={size} />
      <DigitBox value={pad(seconds)} size={size} />
    </div>
  )
}
