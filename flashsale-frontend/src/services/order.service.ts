import apiClient, { withRetry } from '@/lib/api-client'
import type { Order, PurchaseResult } from '@/types'

export interface PurchaseDto {
  campaignProductId: string
  quantity: number
  idempotencyKey: string
}

export interface OrderFilters {
  status?: string
  page?: number
  limit?: number
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
}

export const orderService = new OrderService()
