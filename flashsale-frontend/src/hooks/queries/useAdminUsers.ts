import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'
import type { UserRole } from '@/types'

export function useAdminUsers(filters?: { role?: UserRole; search?: string; page?: number; limit?: number }) {
  const query = useQuery({
    queryKey: queryKeys.admin.users(filters),
    queryFn: () => adminService.getUsers(filters),
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Không thể tải dữ liệu') : null,
    refetch: () => { void query.refetch() },
  }
}
