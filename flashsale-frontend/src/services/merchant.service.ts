import apiClient, { withRetry } from '@/lib/api-client'
import type {
  MerchantApplication,
  MerchantProfile,
  MerchantRevenue,
  MerchantStats,
  RevenueDateRange,
  StripeConnectStatusResponse,
} from '@/types'

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

  initiateStripeConnect(): Promise<{ onboardingUrl: string }> {
    return apiClient.post('/merchants/stripe/connect')
  }

  syncStripeConnect(): Promise<StripeConnectStatusResponse> {
    return apiClient.post('/merchants/stripe/connect/sync')
  }

  getStripeConnectStatus(): Promise<StripeConnectStatusResponse> {
    return withRetry(() => apiClient.get('/merchants/stripe/connect/status'))
  }

  getStripeDashboardLink(): Promise<{ url: string }> {
    return apiClient.get('/merchants/stripe/dashboard')
  }
}

export const merchantService = new MerchantService()
