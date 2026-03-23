import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { CampaignStatus } from '@/types'

export function useAdminCampaigns(status?: CampaignStatus, enabled = true) {
  const params = status ? { status } : undefined
  const query = useQuery({
    queryKey: queryKeys.admin.campaigns(params),
    queryFn: () => adminService.getCampaigns(status),
    enabled,
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải dữ liệu') : null,
    refetch: () => { void query.refetch() },
  }
}
