import { useState } from 'react'
import { toast } from 'sonner'
import { productService } from '@/services/product.service'

export function useDeleteProductImage() {
  const [loading, setLoading] = useState(false)

  const deleteImage = async (productId: string, imageId: string) => {
    setLoading(true)
    try {
      await productService.deleteImage(productId, imageId)
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
