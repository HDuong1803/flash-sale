import apiClient, { withRetry } from '@/lib/api-client'
import type { Campaign, CampaignProduct, CampaignStatus, CampaignReport, CommissionCategory } from '@/types'

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
  commissionCategoryId: string
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
  getCommissionCategories(): Promise<CommissionCategory[]> {
    return withRetry(() => apiClient.get('/campaigns/commission-categories'))
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
  hideExpired(id: string): Promise<{ hidden: boolean }> {
    return apiClient.patch(`/campaigns/${id}/hide-expired`)
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
