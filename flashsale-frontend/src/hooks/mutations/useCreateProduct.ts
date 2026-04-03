import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { productService, type CreateProductDto } from '@/services/product.service'
import { queryKeys } from '@/lib/query-keys'

export function useCreateProduct() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const mutate = async (data: CreateProductDto, files: File[] = []) => {
    setLoading(true)
    try {
      const result = await productService.create(data, files)
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
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
