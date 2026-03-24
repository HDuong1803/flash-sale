import { useCallback, useEffect, useRef, useState } from 'react'
import { paymentService } from '@/services/payment.service'
import { ApiError } from '@/lib/api-client'
import type { PaymentStatus } from '@/types'

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Khoảng thời gian giữa 2 lần poll (ms) */
const POLL_INTERVAL_MS = 3_000

/** Thời gian tối đa chờ thanh toán trước khi báo timeout (ms) = 10 phút */
const PAYMENT_TIMEOUT_MS = 10 * 60 * 1_000

// ─── Types ──────────────────────────────────────────────────────────────────────

export type PaymentPollingState =
  | 'waiting'   // Đang chờ user chuyển khoản
  | 'confirmed' // Thanh toán thành công
  | 'failed'    // Thanh toán thất bại
  | 'timeout'   // Quá thời gian chờ
  | 'error'     // Lỗi kỹ thuật (mất kết nối, ...)

export interface UsePaymentStatusResult {
  /** Trạng thái polling hiện tại */
  pollingState: PaymentPollingState
  /** Trạng thái payment raw từ backend (null khi chưa có dữ liệu) */
  paymentStatus: PaymentStatus | null
  /** ID đơn hàng — chỉ có khi pollingState = 'confirmed' */
  orderId: string | null
  /** Thông báo lỗi nếu có */
  error: string | null
  /** Số giây đã chờ */
  elapsedSeconds: number
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Hook polling trạng thái thanh toán cho trang /payment/pending.
 *
 * Cách hoạt động:
 * 1. Gọi GET /payments/{paymentId}/status mỗi 3 giây
 * 2. Khi status = SUCCESS → pollingState = 'confirmed', trả về orderId
 * 3. Khi status = FAILED/CANCELLED → pollingState = 'failed'
 * 4. Sau 10 phút không có phản hồi → pollingState = 'timeout'
 * 5. Tự dừng polling khi component unmount
 *
 * @param paymentId - ID payment lấy từ URL params (/payment/pending?paymentId=...)
 * @param enabled - Set false để tạm dừng polling (mặc định true)
 */
export function usePaymentStatus(
  paymentId: string | null,
  enabled = true
): UsePaymentStatusResult {
  const [pollingState, setPollingState] = useState<PaymentPollingState>('waiting')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Dùng ref để tracking trong async callbacks (tránh stale closure)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const isStoppedRef = useRef(false)

  const stopPolling = useCallback(() => {
    isStoppedRef.current = true
    if (pollingRef.current) clearInterval(pollingRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const poll = useCallback(async () => {
    // Bảo vệ: không poll nếu đã dừng hoặc thiếu paymentId
    if (isStoppedRef.current || !paymentId) return

    try {
      const result = await paymentService.getStatus(paymentId)

      // Cập nhật elapsed time
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
      setPaymentStatus(result.status)

      switch (result.status) {
        case 'SUCCESS':
          // Thanh toán thành công — dừng polling, trả về orderId
          setOrderId(result.orderId)
          setPollingState('confirmed')
          stopPolling()
          break

        case 'FAILED':
        case 'CANCELLED':
          // Thanh toán thất bại/huỷ — dừng polling
          setPollingState('failed')
          stopPolling()
          break

        case 'PENDING':
        case 'PROCESSING':
          // Vẫn đang chờ — tiếp tục poll
          setPollingState('waiting')
          break

        default:
          // Trạng thái không mong đợi — log và tiếp tục poll
          setPollingState('waiting')
      }
    } catch (err) {
      if (isStoppedRef.current) return

      // Lỗi 401/403: không có quyền → dừng hẳn
      if (err instanceof ApiError && (err.statusCode === 401 || err.statusCode === 403)) {
        setError('Không có quyền xem thông tin thanh toán này')
        setPollingState('error')
        stopPolling()
        return
      }

      // Lỗi 404: payment không tồn tại → dừng hẳn
      if (err instanceof ApiError && err.statusCode === 404) {
        setError('Không tìm thấy thông tin thanh toán')
        setPollingState('error')
        stopPolling()
        return
      }

      // Lỗi mạng tạm thời (timeout, 5xx) → không dừng, tiếp tục poll
      // Không set error để tránh giật UI
    }
  }, [paymentId, stopPolling])

  useEffect(() => {
    // Không poll nếu không có paymentId hoặc bị disabled
    if (!paymentId || !enabled) return

    // Reset state khi paymentId thay đổi
    isStoppedRef.current = false
    startTimeRef.current = Date.now()
    setPollingState('waiting')
    setPaymentStatus(null)
    setOrderId(null)
    setError(null)
    setElapsedSeconds(0)

    // Gọi ngay lần đầu (không chờ 3 giây)
    void poll()

    // Sau đó poll định kỳ mỗi POLL_INTERVAL_MS
    pollingRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS)

    // Timeout tổng: sau PAYMENT_TIMEOUT_MS → báo timeout
    timeoutRef.current = setTimeout(() => {
      if (!isStoppedRef.current) {
        setPollingState('timeout')
        stopPolling()
      }
    }, PAYMENT_TIMEOUT_MS)

    // Cleanup khi component unmount hoặc paymentId thay đổi
    return () => stopPolling()
  }, [paymentId, enabled, poll, stopPolling])

  return { pollingState, paymentStatus, orderId, error, elapsedSeconds }
}
