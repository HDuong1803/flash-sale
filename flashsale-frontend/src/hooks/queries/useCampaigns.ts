import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { campaignService, type CampaignFilters } from '@/services/campaign.service'

export function useCampaigns(filters?: CampaignFilters) {
  const query = useQuery({
    queryKey: queryKeys.campaigns.list(filters),
    queryFn: () => campaignService.getAll(filters),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải dữ liệu') : null,
    refetch: () => { void query.refetch() },
  }
}
