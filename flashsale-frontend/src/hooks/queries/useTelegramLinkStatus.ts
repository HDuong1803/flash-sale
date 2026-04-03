import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { notificationService } from '@/services/notification.service'
import type { TelegramLinkStatus } from '@/types'

const DEFAULT_TELEGRAM_STATUS: TelegramLinkStatus = {
  linked: false,
  telegramUsername: null,
  telegramFirstName: null,
  linkedAt: null
}

export function useTelegramLinkStatus() {
  const query = useQuery<TelegramLinkStatus>({
    queryKey: queryKeys.notifications.telegramStatus(),
    queryFn: () => notificationService.getTelegramStatus(),
  })

  return {
    data: query.data ?? DEFAULT_TELEGRAM_STATUS,
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Không thể tải trạng thái Telegram'
      : null,
    refetch: () => {
      void query.refetch()
    },
  }
}
