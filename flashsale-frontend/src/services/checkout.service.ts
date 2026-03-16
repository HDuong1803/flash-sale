import apiClient from '@/lib/api-client'

export interface CheckoutDto {
  reservationId: string
  shippingAddress: string
  paymentMethod: 'VNPAY' | 'MOMO' | 'STRIPE'
}

class CheckoutService {
  initiate(data: CheckoutDto): Promise<{ paymentUrl: string; orderId: string }> {
    return apiClient.post('/checkout', data)
  }
}

export const checkoutService = new CheckoutService()
