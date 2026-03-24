import { useState } from 'react'
import { toast } from 'sonner'
import { productService } from '@/services/product.service'

export function useDeleteProduct() {
  const [loading, setLoading] = useState(false)

  const deleteProduct = async (id: string) => {
    setLoading(true)
    try {
      await productService.delete(id)
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
