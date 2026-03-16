import { useState, useEffect, useCallback } from 'react'

interface CountdownResult {
  days: number
  hours: number
  minutes: number
  seconds: number
  isExpired: boolean
  totalSeconds: number
}

export function useCountdown(targetDate: string): CountdownResult {
  const calculate = useCallback((): CountdownResult => {
    const diff = new Date(targetDate).getTime() - Date.now()
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true, totalSeconds: 0 }
    const totalSeconds = Math.floor(diff / 1000)
    return {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      isExpired: false,
      totalSeconds,
    }
  }, [targetDate])

  const [state, setState] = useState<CountdownResult>(calculate)

  useEffect(() => {
    setState(calculate())
    const interval = setInterval(() => {
      const next = calculate()
      setState(next)
    }, 1000)
    return () => clearInterval(interval)
  }, [calculate])

  return state
}
