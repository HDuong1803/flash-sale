import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { campaignService } from '@/services/campaign.service'

export function useCampaign(id: string | null) {
  const query = useQuery({
    queryKey: queryKeys.campaigns.detail(id ?? ''),
    queryFn: () => campaignService.getById(id!),
    enabled: !!id,
  })

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải dữ liệu') : null,
    refetch: () => { void query.refetch() },
  }
}
