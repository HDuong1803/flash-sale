import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { notificationService } from '@/services/notification.service'
import type { NotificationPreferences } from '@/types'

const DEFAULT_PREFERENCES: NotificationPreferences = {
  notificationsEnabled: true,
  campaignReminderEnabled: true,
  orderStatusEnabled: true,
}

export function useNotificationPreferences() {
  const query = useQuery<NotificationPreferences>({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: () => notificationService.getPreferences(),
  })

  return {
    data: query.data ?? DEFAULT_PREFERENCES,
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải cấu hình thông báo'
      : null,
    refetch: () => {
      void query.refetch()
    },
  }
}
