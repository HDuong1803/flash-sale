import apiClient, { withRetry } from '@/lib/api-client'
import type { FulfillmentOrder, QcCheckpoint } from '@/types'

export interface QcSubmitItem {
  key: string
  label: string
  passed: boolean | null
}

export interface PassQcDto {
  checklist: QcSubmitItem[]
  weightGrams?: number
  notes?: string
}

export interface FailQcDto {
  failReason: string
  checklist: QcSubmitItem[]
  notes?: string
}

export interface BookLabelDto {
  weightGrams?: number
  dimensionsCm?: { l: number; w: number; h: number }
}

export interface PendingQcOrder {
  orderId: string
  orderCreatedAt: string
  customerName: string | null
  totalAmount: number
  qcStatus: string
  fulfillStatus: string
  slaDeadline: string | null
  slaBreached: boolean
  itemCount: number
}

class FulfillmentService {
  getFulfillmentDetail(orderId: string): Promise<FulfillmentOrder | null> {
    return withRetry(() => apiClient.get(`/fulfillment/orders/${orderId}`))
  }

  getQcDetail(orderId: string): Promise<QcCheckpoint | null> {
    return withRetry(() => apiClient.get(`/fulfillment/qc/${orderId}`))
  }

  getPendingQcOrders(params?: {
    limit?: number
    offset?: number
  }): Promise<{ items: QcCheckpoint[]; total: number }> {
    return withRetry(() => apiClient.get('/fulfillment/qc', { params }))
  }

  passQc(orderId: string, data: PassQcDto): Promise<QcCheckpoint> {
    return apiClient.post(`/fulfillment/qc/${orderId}/pass`, data)
  }

  failQc(orderId: string, data: FailQcDto): Promise<QcCheckpoint> {
    return apiClient.post(`/fulfillment/qc/${orderId}/fail`, data)
  }

  reworkQc(orderId: string, note?: string): Promise<QcCheckpoint> {
    return apiClient.post(`/fulfillment/qc/${orderId}/rework`, { note })
  }

  bookLabel(orderId: string, data?: BookLabelDto): Promise<FulfillmentOrder> {
    return apiClient.post(`/fulfillment/orders/${orderId}/book-label`, data ?? {})
  }
}

export const fulfillmentService = new FulfillmentService()
