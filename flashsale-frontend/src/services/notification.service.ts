import apiClient, { withRetry } from '@/lib/api-client'
import type { Notification, NotificationPreferences } from '@/types'

class NotificationService {
  getAll(): Promise<Notification[]> {
    return withRetry(() => apiClient.get('/notifications'))
  }
  markRead(id: string): Promise<void> {
    return apiClient.patch(`/notifications/${id}/read`)
  }
  markAllRead(): Promise<void> {
    return apiClient.patch('/notifications/read-all')
  }

  getPreferences(): Promise<NotificationPreferences> {
    return withRetry(() => apiClient.get('/notifications/preferences'))
  }

  updatePreferences(
    data: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    return apiClient.patch('/notifications/preferences', data)
  }
}

export const notificationService = new NotificationService()
