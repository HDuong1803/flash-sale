import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'

export function useDeleteExpiredCampaign() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const deleteExpired = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.deleteExpiredCampaign(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
      ])
      toast.success('Đã xóa chiến dịch đã hết hạn')
      return result
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Xóa chiến dịch hết hạn thất bại'
      )
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteExpired, loading }
}
