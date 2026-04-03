import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notificationService } from '@/services/notification.service'
import { ApiError } from '@/lib/api-client'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'

export function useMarkAllReadNotifications() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const markAllRead = async () => {
    setLoading(true)
    try {
      await notificationService.markAllRead()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() }),
      ])
      toast.success('Đã đánh dấu tất cả là đã đọc')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không thể đánh dấu đã đọc')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { markAllRead, loading }
}
