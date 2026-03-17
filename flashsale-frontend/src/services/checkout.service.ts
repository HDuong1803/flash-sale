import apiClient from '@/lib/api-client'
import type { PaymentMethod } from '@/types'

export interface CheckoutDto {
  reservationId: string
  shippingAddress: string
  paymentMethod: PaymentMethod
}

export interface CheckoutResponse {
  paymentUrl: string
  orderId: string
}

class CheckoutService {
  initiate(data: CheckoutDto): Promise<CheckoutResponse> {
    return apiClient.post('/checkout', data)
  }
}

export const checkoutService = new CheckoutService()
