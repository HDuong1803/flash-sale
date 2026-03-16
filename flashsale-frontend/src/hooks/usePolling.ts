import { useState, useEffect, useRef, useCallback } from 'react'

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number,
  stopCondition: (data: T) => boolean,
  maxAttempts = 30,
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attemptCount, setAttemptCount] = useState(0)
  const fetchFnRef = useRef(fetchFn)
  const stopConditionRef = useRef(stopCondition)
  const mountedRef = useRef(true)
  const stoppedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => { fetchFnRef.current = fetchFn }, [fetchFn])
  useEffect(() => { stopConditionRef.current = stopCondition }, [stopCondition])

  const stop = useCallback(() => {
    stoppedRef.current = true
    clearTimeout(timerRef.current)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    stoppedRef.current = false
    let attempts = 0

    const poll = async () => {
      if (!mountedRef.current || stoppedRef.current) return

      try {
        const result = await fetchFnRef.current()
        if (!mountedRef.current) return

        setData(result)
        setError(null)
        attempts++
        setAttemptCount(attempts)

        if (stopConditionRef.current(result)) {
          setLoading(false)
          return
        }
        if (attempts >= maxAttempts) {
          setLoading(false)
          setError('TIMEOUT')
          return
        }

        timerRef.current = setTimeout(poll, intervalMs)
      } catch (err) {
        if (!mountedRef.current) return
        setError(err instanceof Error ? err.message : 'Lỗi không xác định')
        setLoading(false)
      }
    }

    poll()

    return () => {
      mountedRef.current = false
      clearTimeout(timerRef.current)
    }
  }, [intervalMs, maxAttempts])

  return { data, loading, error, stop, attemptCount }
}
