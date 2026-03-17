import { useState } from 'react'
import { notificationService } from '@/services/notification.service'
import { ApiError } from '@/lib/api-client'
import { toast } from 'sonner'

export function useMarkAllReadNotifications() {
  const [loading, setLoading] = useState(false)

  const markAllRead = async () => {
    setLoading(true)
    try {
      await notificationService.markAllRead()
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
