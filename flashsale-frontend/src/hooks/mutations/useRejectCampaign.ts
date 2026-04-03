import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'

export function useRejectCampaign() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const reject = async (id: string, reason: string) => {
    setLoading(true)
    try {
      const result = await adminService.rejectCampaign(id, reason)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
      ])
      toast.success('Đã từ chối chiến dịch')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { reject, loading }
}
