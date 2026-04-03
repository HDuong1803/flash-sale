import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'
import type { AdminUserDetail } from '@/types'

export function useAdminUserDetail(id: string) {
  const query = useQuery<AdminUserDetail>({
    queryKey: queryKeys.admin.userDetail(id),
    queryFn: () => adminService.getUserDetail(id),
    enabled: !!id,
  })

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải thông tin người dùng'
      : null,
    refetch: () => {
      void query.refetch()
    },
  }
}
