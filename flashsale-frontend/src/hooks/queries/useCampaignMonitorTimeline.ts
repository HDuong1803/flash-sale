import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { CampaignMonitorTimelineItem } from '@/types'

export function useCampaignMonitorTimeline(params?: {
  campaignId?: string
  minutes?: number
  bucketMinutes?: number
}) {
  const query = useQuery<CampaignMonitorTimelineItem[]>({
    queryKey: queryKeys.admin.campaignMonitorTimeline(params),
    queryFn: () => adminService.getCampaignMonitorTimeline(params),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải monitor timeline'
      : null,
    refetch: () => { void query.refetch() },
  }
}

