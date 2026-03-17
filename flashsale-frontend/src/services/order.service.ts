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
  status: 'HOLDING' | 'PAID' | 'EXPIRED'
  quantity: number
  expiredAt: string
  shippingAddress?: string
  campaignProduct: {
    salePrice: number
    product: { name: string; imageUrl?: string }
  }
}

class OrderService {
  purchase(data: PurchaseDto): Promise<{ requestId: string }> {
    return apiClient.post(
      '/orders/purchase',
      { campaignProductId: data.campaignProductId, quantity: data.quantity },
      { headers: { 'X-Idempotency-Key': data.idempotencyKey } },
    )
  }
  getResult(requestId: string): Promise<PurchaseResult> {
    return apiClient.get(`/orders/result/${requestId}`)
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
