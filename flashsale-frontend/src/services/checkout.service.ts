import apiClient from '@/lib/api-client'
import type { CheckoutPaymentMethod, PaymentMethod } from '@/types'

export interface CheckoutDto {
  reservationId: string
  shippingAddress: string
  paymentMethod: PaymentMethod
  clientOrigin?: string
}

export interface CheckoutResponse {
  paymentUrl: string
  paymentId: string
}

class CheckoutService {
  initiate(data: CheckoutDto): Promise<CheckoutResponse> {
    return apiClient.post('/checkout', data)
  }

  getPaymentMethods(): Promise<CheckoutPaymentMethod[]> {
    return apiClient.get('/checkout/payment-methods')
  }
}

export const checkoutService = new CheckoutService()
