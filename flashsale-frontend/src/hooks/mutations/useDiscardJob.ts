import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminService } from '@/services/admin.service'
import { queryKeys } from '@/lib/query-keys'

export function useDiscardJob() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const discard = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.discardJob(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.deadLetterQueue() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.queueStats() }),
      ])
      toast.success('Đã loại bỏ job')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { discard, loading }
}
