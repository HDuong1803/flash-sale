import apiClient, { withRetry } from '@/lib/api-client'
import type { MerchantApplication, MerchantProfile, MerchantRevenue, MerchantStats, RevenueDateRange } from '@/types'

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
  getRevenue(range: RevenueDateRange): Promise<MerchantRevenue> {
    return withRetry(() => apiClient.get('/merchants/revenue', { params: range }))
  }
}

export const merchantService = new MerchantService()
