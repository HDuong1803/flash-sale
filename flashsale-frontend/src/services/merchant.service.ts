import apiClient, { withRetry } from '@/lib/api-client'
import type { MerchantApplication, MerchantProfile, MerchantStats } from '@/types'

export interface ApplyMerchantDto {
  businessName: string
  taxCode: string
  description: string
  phone: string
  address: string
}

class MerchantService {
  apply(data: ApplyMerchantDto): Promise<MerchantApplication> {
    return apiClient.post('/merchants/apply', data)
  }
  getApplicationStatus(): Promise<MerchantApplication | null> {
    return withRetry(() => apiClient.get('/merchants/application-status'))
  }
  getProfile(): Promise<MerchantProfile> {
    return withRetry(() => apiClient.get('/merchants/me'))
  }
  getStats(): Promise<MerchantStats> {
    return withRetry(() => apiClient.get('/merchants/stats'))
  }
}

export const merchantService = new MerchantService()
