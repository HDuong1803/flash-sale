import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'

export function useApproveMerchant() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (id: string) => adminService.approveMerchant(id),
    onSuccess: () => {
      toast.success('Đã duyệt merchant!')
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.merchants.all })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra'
      toast.error(msg)
    },
  })

  return {
    approve: mutation.mutateAsync,
    loading: mutation.isPending,
  }
}
