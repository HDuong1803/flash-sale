import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { productService } from '@/services/product.service'
import { queryKeys } from '@/lib/query-keys'

export function useDeleteProduct() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const deleteProduct = async (id: string) => {
    setLoading(true)
    try {
      await productService.delete(id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
      toast.success('Đã xoá sản phẩm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xoá sản phẩm')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteProduct, loading }
}
