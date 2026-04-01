import { useQuery } from '@tanstack/react-query'
import { campaignService } from '@/services/campaign.service'
import { queryKeys } from '@/lib/query-keys'

export function useCommissionCategories() {
  const query = useQuery({
    queryKey: queryKeys.campaigns.commissionCategories(),
    queryFn: () => campaignService.getCommissionCategories(),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải danh mục hoa hồng') : null,
    refetch: () => { void query.refetch() },
  }
}

