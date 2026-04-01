import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { CampaignMonitorOverview } from '@/types'

export function useCampaignMonitorOverview(params?: {
  campaignId?: string
  minutes?: number
}) {
  const query = useQuery<CampaignMonitorOverview>({
    queryKey: queryKeys.admin.campaignMonitorOverview(params),
    queryFn: () => adminService.getCampaignMonitorOverview(params),
    refetchInterval: 30_000,
  })

  return {
    data: query.data,
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải monitor overview'
      : null,
    refetch: () => { void query.refetch() },
  }
}

