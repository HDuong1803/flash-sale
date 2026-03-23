import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { campaignService } from '@/services/campaign.service'
import type { Campaign } from '@/types'

export function useMyCampaigns() {
  const query = useQuery<Campaign[]>({
    queryKey: queryKeys.campaigns.my(),
    queryFn: () => campaignService.getMyCampaigns(),
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
