import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { productService, type CreateProductDto } from '@/services/product.service'
import { queryKeys } from '@/lib/query-keys'

export function useUpdateProduct() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const updateProduct = async (id: string, data: Partial<CreateProductDto>, files: File[] = []) => {
    setLoading(true)
    try {
      const result = await productService.update(id, data, files)
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
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
