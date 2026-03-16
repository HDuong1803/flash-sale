import apiClient, { withRetry } from '@/lib/api-client'
import type { Notification } from '@/types'

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
}

export const notificationService = new NotificationService()
