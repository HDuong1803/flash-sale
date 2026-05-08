import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'
import type { UserActionLog } from '@/types'

export interface UserActionLogsParams {
  page: number
  limit: number
  action?: string
  userId?: string
  ip?: string
  from?: string
  to?: string
}

export function useUserActionLogs(params: UserActionLogsParams, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.admin.userActionLogs(params),
    queryFn: () => adminService.getUserActionLogs(params),
    enabled,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  return {
    items: (query.data?.items ?? []) as UserActionLog[],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải nhật ký thao tác'
      : null,
    refetch: () => { void query.refetch() },
  }
}
