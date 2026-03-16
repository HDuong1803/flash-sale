import { useState } from 'react'
import { toast } from 'sonner'
import { productService, type CreateProductDto } from '@/services/product.service'

export function useCreateProduct() {
  const [loading, setLoading] = useState(false)

  const mutate = async (data: CreateProductDto) => {
    setLoading(true)
    try {
      const result = await productService.create(data)
      toast.success('Tạo sản phẩm thành công!')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { mutate, loading }
}
