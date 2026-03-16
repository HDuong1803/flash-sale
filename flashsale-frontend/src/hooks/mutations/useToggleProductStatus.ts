import { useState } from 'react'
import { toast } from 'sonner'
import { productService } from '@/services/product.service'

export function useToggleProductStatus() {
  const [loading, setLoading] = useState(false)

  const mutate = async (id: string) => {
    setLoading(true)
    try {
      const result = await productService.toggleStatus(id)
      toast.success('Cập nhật trạng thái thành công!')
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
