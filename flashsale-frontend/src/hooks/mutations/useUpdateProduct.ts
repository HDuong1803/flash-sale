import { useState } from 'react'
import { toast } from 'sonner'
import { productService, type CreateProductDto } from '@/services/product.service'
import type { Product } from '@/types'

export function useUpdateProduct() {
  const [loading, setLoading] = useState(false)

  const updateProduct = async (id: string, data: Partial<CreateProductDto>) => {
    setLoading(true)
    try {
      const result = await productService.update(id, data)
      toast.success('Cập nhật sản phẩm thành công!')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updateProduct, loading }
}
