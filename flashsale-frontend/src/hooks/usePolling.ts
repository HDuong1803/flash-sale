import { useState, useEffect, useRef, useCallback } from 'react'
import { ApiError } from '@/lib/api-client'

type PollingErrorCode =
  | 'TIMEOUT'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'UNKNOWN'

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number,
  stopCondition: (data: T) => boolean,
  maxAttempts = 30,
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<PollingErrorCode | null>(null)
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

      attempts++
      setAttemptCount(attempts)

      try {
        const result = await fetchFnRef.current()
        if (!mountedRef.current) return

        setData(result)
        setError(null)
        setErrorCode(null)

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

        if (err instanceof ApiError) {
          if (err.statusCode === 401) {
            setError('Phiên đăng nhập đã hết hạn')
            setErrorCode('UNAUTHORIZED')
            setLoading(false)
            return
          }

          if (err.statusCode === 403) {
            setError('Yêu cầu mua hàng này không thuộc về bạn')
            setErrorCode('FORBIDDEN')
            setLoading(false)
            return
          }

          if (err.statusCode === 404) {
            setError('Không tìm thấy yêu cầu mua hàng')
            setErrorCode('NOT_FOUND')
            setLoading(false)
            return
          }
        }

        // Lỗi mạng/server tạm thời: tiếp tục thử cho đến khi đạt maxAttempts.
        if (attempts >= maxAttempts) {
          setError('TIMEOUT')
          setErrorCode('TIMEOUT')
          setLoading(false)
          return
        }

        setError(err instanceof Error ? err.message : 'Lỗi không xác định')
        setErrorCode('UNKNOWN')
        timerRef.current = setTimeout(poll, intervalMs)
      }
    }

    poll()

    return () => {
      mountedRef.current = false
      clearTimeout(timerRef.current)
    }
  }, [intervalMs, maxAttempts])

  return { data, loading, error, errorCode, stop, attemptCount }
}
