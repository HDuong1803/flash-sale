import apiClient from '@/lib/api-client'
import type { PaymentStatus } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface PaymentStatusResponse {
  status: PaymentStatus
  orderId: string | null
}

// ─── Service ────────────────────────────────────────────────────────────────────

class PaymentService {
  /**
   * Lấy trạng thái thanh toán hiện tại.
   * Dùng cho frontend polling ở trang /payment/pending.
   *
   * @param paymentId - ID thanh toán (lấy từ URL params)
   */
  getStatus(paymentId: string): Promise<PaymentStatusResponse> {
    return apiClient.get(`/payments/${paymentId}/status`)
  }
}

export const paymentService = new PaymentService()
