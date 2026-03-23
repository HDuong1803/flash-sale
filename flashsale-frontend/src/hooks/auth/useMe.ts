import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { useAuthContext } from '@/contexts/auth-context'
import { authService } from '@/services/auth.service'
import type { User } from '@/types'

export function useMe() {
  const { isAuthenticated } = useAuthContext()

  return useQuery<User>({
    queryKey: queryKeys.users.me(),
    queryFn: () => authService.getMe(),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: false,
  })
}
