import apiClient, { withRetry } from '@/lib/api-client'
import type { Product } from '@/types'

export interface CreateProductDto {
  name: string
  description: string
  originalPrice: number
  inventory: number
}

class ProductService {
  getMyProducts(): Promise<Product[]> {
    return withRetry(() => apiClient.get('/products'))
  }

  create(data: CreateProductDto, file?: File): Promise<Product> {
    if (file) {
      const form = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        if (v != null) form.append(k, String(v))
      })
      form.append('file', file)
      return apiClient.post('/products', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }
    return apiClient.post('/products', data)
  }

  update(id: string, data: Partial<CreateProductDto>, file?: File): Promise<Product> {
    if (file) {
      const form = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        if (v != null) form.append(k, String(v))
      })
      form.append('file', file)
      return apiClient.put(`/products/${id}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }
    return apiClient.put(`/products/${id}`, data)
  }

  toggleStatus(id: string): Promise<Product> {
    return apiClient.patch(`/products/${id}/status`)
  }

  getInventory(id: string): Promise<{ quantity: number; reserved: number }> {
    return withRetry(() => apiClient.get(`/products/${id}/inventory`))
  }
}

export const productService = new ProductService()
