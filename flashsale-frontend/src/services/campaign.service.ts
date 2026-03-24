import apiClient, { withRetry } from '@/lib/api-client'
import type { Campaign, CampaignProduct, CampaignStatus, CampaignReport } from '@/types'

export interface CampaignFilters {
  status?: CampaignStatus
  search?: string
  page?: number
  limit?: number
}

export interface CreateCampaignDto {
  name: string
  description?: string
  startTime: string
  endTime: string
}

export interface AddCampaignProductDto {
  productId: string
  salePrice: number
  saleQuantity: number
  perUserLimit: number
}

class CampaignService {
  getAll(filters?: CampaignFilters): Promise<Campaign[]> {
    return withRetry(() => apiClient.get('/campaigns', { params: filters }))
  }
  getById(id: string): Promise<Campaign> {
    return withRetry(() => apiClient.get(`/campaigns/${id}`))
  }
  create(data: CreateCampaignDto): Promise<Campaign> {
    return apiClient.post('/campaigns', data)
  }
  update(id: string, data: Partial<CreateCampaignDto>): Promise<Campaign> {
    return apiClient.put(`/campaigns/${id}`, data)
  }
  addProduct(campaignId: string, data: AddCampaignProductDto): Promise<CampaignProduct> {
    return apiClient.post(`/campaigns/${campaignId}/products`, data)
  }
  removeProduct(campaignId: string, productId: string): Promise<void> {
    return apiClient.delete(`/campaigns/${campaignId}/products/${productId}`)
  }
  getMyCampaigns(): Promise<Campaign[]> {
    return apiClient.get('/merchants/me/campaigns')
  }
  delete(id: string): Promise<{ deleted: boolean }> {
    return apiClient.delete(`/campaigns/${id}`)
  }
  preRegister(campaignId: string): Promise<{ registered: boolean }> {
    return apiClient.post(`/campaigns/${campaignId}/register`)
  }

  cancelPreRegister(campaignId: string): Promise<{ registered: boolean }> {
    return apiClient.delete(`/campaigns/${campaignId}/register`)
  }
  submit(id: string): Promise<Campaign> {
    return apiClient.post(`/campaigns/${id}/submit`)
  }
  getReport(id: string): Promise<CampaignReport> {
    return withRetry(() => apiClient.get(`/campaigns/${id}/report`))
  }
}

export const campaignService = new CampaignService()
