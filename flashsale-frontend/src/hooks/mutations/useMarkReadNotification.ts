import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notificationService } from '@/services/notification.service'
import { ApiError } from '@/lib/api-client'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'

export function useMarkReadNotification() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const markRead = async (id: string) => {
    setLoading(true)
    try {
      await notificationService.markRead(id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() }),
      ])
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không thể đánh dấu đã đọc')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { markRead, loading }
}
