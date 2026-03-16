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
  create(data: CreateProductDto): Promise<Product> {
    return apiClient.post('/products', data)
  }
  update(id: string, data: Partial<CreateProductDto>): Promise<Product> {
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
