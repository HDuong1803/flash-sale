import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { productService } from '@/services/product.service'
import { queryKeys } from '@/lib/query-keys'

export function useDeleteProductImage() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const deleteImage = async (productId: string, imageId: string) => {
    setLoading(true)
    try {
      await productService.deleteImage(productId, imageId)
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
      toast.success('Đã xoá ảnh')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xoá ảnh')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteImage, loading }
}
