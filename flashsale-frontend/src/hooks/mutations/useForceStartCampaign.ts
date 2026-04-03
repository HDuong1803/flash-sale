import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin.service'

export function useForceStartCampaign() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const forceStart = async (id: string) => {
    setLoading(true)
    try {
      const result = await adminService.forceStartCampaign(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
      ])
      toast.success('Chiến dịch đã được bắt đầu ngay lập tức!')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { forceStart, loading }
}
