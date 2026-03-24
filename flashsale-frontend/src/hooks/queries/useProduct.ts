import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { productService, type ProductDetail } from '@/services/product.service'

export function useProduct(id: string) {
  const query = useQuery<ProductDetail>({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => productService.getById(id),
    enabled: !!id,
  })

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải sản phẩm'
      : null,
    refetch: () => { void query.refetch() },
  }
}
