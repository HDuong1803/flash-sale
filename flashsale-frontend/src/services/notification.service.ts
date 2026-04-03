import apiClient, { withRetry } from '@/lib/api-client'
import type {
  Notification,
  NotificationPreferences,
  TelegramLinkStatus
} from '@/types'

interface TelegramLinkTokenResponse {
  botUsername: string
  deepLink: string
  expiresInSeconds: number
}

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

  createTelegramLinkToken(): Promise<TelegramLinkTokenResponse> {
    return apiClient.post('/notifications/telegram/link-token')
  }

  getTelegramStatus(): Promise<TelegramLinkStatus> {
    return withRetry(() => apiClient.get('/notifications/telegram/status'))
  }

  unlinkTelegram(): Promise<{ revoked: boolean }> {
    return apiClient.delete('/notifications/telegram/link')
  }
}

export const notificationService = new NotificationService()
