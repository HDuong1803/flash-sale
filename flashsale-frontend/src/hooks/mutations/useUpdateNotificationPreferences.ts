import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { notificationService } from '@/services/notification.service'
import type { NotificationPreferences } from '@/types'

export function useUpdateNotificationPreferences() {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const updatePreferences = async (
    payload: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> => {
    setLoading(true)
    try {
      const result = await notificationService.updatePreferences(payload)
      queryClient.setQueryData(queryKeys.notifications.preferences(), result)
      toast.success('Đã lưu cài đặt thông báo')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lưu cài đặt thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updatePreferences, loading }
}
