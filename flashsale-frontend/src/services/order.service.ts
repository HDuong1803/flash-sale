import apiClient, { withRetry } from '@/lib/api-client'
import type { Order, PurchaseResult, OrderStatus } from '@/types'

export interface PurchaseDto {
  campaignProductId: string
  quantity: number
  idempotencyKey: string
}

export interface OrderFilters {
  status?: OrderStatus
  page?: number
  limit?: number
}

export interface ReservationDetail {
  id: string
  status: 'HOLDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'FAILED'
  quantity: number
  expiredAt: string
  shippingAddress?: string | null
  totalAmount: number
  campaignProduct: {
    salePrice: number
    product: { name: string; imageUrl: string | null }
  }
}

class OrderService {
  purchase(data: PurchaseDto): Promise<{ requestId: string }> {
    const quantity = Math.floor(data.quantity)
    if (!data.campaignProductId?.trim()) {
      throw new Error('Thiếu thông tin sản phẩm cần mua')
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Số lượng mua không hợp lệ')
    }

    return apiClient.post(
      '/orders/purchase',
      { campaignProductId: data.campaignProductId.trim(), quantity },
      { headers: { 'X-Idempotency-Key': data.idempotencyKey } },
    )
  }
  getResult(requestId: string): Promise<PurchaseResult> {
    if (!requestId?.trim()) {
      throw new Error('Không tìm thấy mã yêu cầu mua hàng')
    }
    return apiClient.get(`/orders/result/${encodeURIComponent(requestId.trim())}`)
  }
  getMyOrders(filters?: OrderFilters): Promise<Order[]> {
    return withRetry(() => apiClient.get('/orders', { params: filters }))
  }
  getById(id: string): Promise<Order> {
    return withRetry(() => apiClient.get(`/orders/${id}`))
  }
  getMerchantOrders(filters?: OrderFilters): Promise<Order[]> {
    return withRetry(() => apiClient.get('/merchants/orders', { params: filters }))
  }
  getReservation(reservationId: string): Promise<ReservationDetail> {
    return withRetry(() => apiClient.get(`/reservations/${reservationId}`))
  }
}

export const orderService = new OrderService()
