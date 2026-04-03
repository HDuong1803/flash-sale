import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'

export function useRetryJob() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const mutate = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.retryJob(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.deadLetterQueue() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.queueStats() }),
      ])
      toast.success('Đã thêm vào hàng đợi thử lại')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { mutate, loading }
}
