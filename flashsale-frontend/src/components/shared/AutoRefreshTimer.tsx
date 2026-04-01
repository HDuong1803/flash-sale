'use client'

import { useState, useEffect } from 'react'
import { RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AutoRefreshTimerProps {
  onRefresh: () => void
  intervalSeconds?: number
}

export function AutoRefreshTimer({ onRefresh, intervalSeconds = 30 }: AutoRefreshTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds)

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          onRefresh()
          return intervalSeconds
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [onRefresh, intervalSeconds])

  const isUrgent = secondsLeft <= 5

  return (
    <div className={cn(
      'flex items-center gap-2 glass px-3 py-2 rounded-lg text-sm transition-all',
      isUrgent && 'animate-pulse'
    )}>
      <RefreshCcw 
        size={14} 
        className={cn(
          'transition-colors',
          isUrgent ? 'text-yellow-400' : 'text-white/50'
        )} 
      />
      <span className={cn(
        'font-mono font-medium transition-colors',
        isUrgent ? 'text-yellow-400' : 'text-white/70'
      )}>
        {secondsLeft}s
      </span>
    </div>
  )
}
