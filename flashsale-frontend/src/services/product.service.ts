import apiClient, { withRetry } from '@/lib/api-client'
import type { Product, ProductCampaignSummary } from '@/types'

export type ProductDetail = Product & { campaigns: ProductCampaignSummary[] }

export interface CreateProductDto {
  name: string
  description?: string
  originalPrice: number
  inventory: number
}

function buildFormData(data: Partial<CreateProductDto>, files: File[]): FormData {
  const form = new FormData()
  Object.entries(data).forEach(([k, v]) => {
    if (v != null) form.append(k, String(v))
  })
  files.forEach(f => form.append('files', f))
  return form
}

class ProductService {
  getMyProducts(): Promise<Product[]> {
    return withRetry(() => apiClient.get('/products'))
  }

  getById(id: string): Promise<ProductDetail> {
    return withRetry(() => apiClient.get(`/products/${id}`))
  }

  delete(id: string): Promise<void> {
    return apiClient.delete(`/products/${id}`)
  }

  create(data: CreateProductDto, files: File[] = []): Promise<Product> {
    if (files.length > 0) {
      return apiClient.post('/products', buildFormData(data, files), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }
    return apiClient.post('/products', data)
  }

  update(id: string, data: Partial<CreateProductDto>, files: File[] = []): Promise<Product> {
    const form = buildFormData(data, files)
    return apiClient.put(`/products/${id}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }

  deleteImage(productId: string, imageId: string): Promise<void> {
    return apiClient.delete(`/products/${productId}/images/${imageId}`)
  }

  toggleStatus(id: string): Promise<Product> {
    return apiClient.patch(`/products/${id}/status`)
  }

  getInventory(id: string): Promise<{ quantity: number; reserved: number }> {
    return withRetry(() => apiClient.get(`/products/${id}/inventory`))
  }
}

export const productService = new ProductService()
