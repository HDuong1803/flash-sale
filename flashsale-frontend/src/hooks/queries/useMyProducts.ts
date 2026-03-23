import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { productService } from '@/services/product.service'
import type { Product } from '@/types'

export function useMyProducts() {
  const query = useQuery<Product[]>({
    queryKey: queryKeys.products.my(),
    queryFn: () => productService.getMyProducts(),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải dữ liệu'
      : null,
    refetch: () => { void query.refetch() },
  }
}
