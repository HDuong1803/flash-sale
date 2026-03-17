import { useState } from 'react'
import { notificationService } from '@/services/notification.service'
import { ApiError } from '@/lib/api-client'
import { toast } from 'sonner'

export function useMarkReadNotification() {
  const [loading, setLoading] = useState(false)

  const markRead = async (id: string) => {
    setLoading(true)
    try {
      await notificationService.markRead(id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không thể đánh dấu đã đọc')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { markRead, loading }
}
