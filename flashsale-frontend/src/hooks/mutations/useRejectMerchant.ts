import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'

export function useRejectMerchant() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminService.rejectMerchant(id, reason ?? ''),
    onSuccess: () => {
      toast.success('Đã từ chối nhà bán hàng')
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.merchants.all })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra'
      toast.error(msg)
    },
  })

  return {
    reject: (id: string, reason: string) => mutation.mutateAsync({ id, reason }),
    loading: mutation.isPending,
  }
}
