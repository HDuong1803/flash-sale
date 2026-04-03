import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { productService } from '@/services/product.service'
import { queryKeys } from '@/lib/query-keys'

export function useToggleProductStatus() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const mutate = async (id: string) => {
    setLoading(true)
    try {
      const result = await productService.toggleStatus(id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
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
