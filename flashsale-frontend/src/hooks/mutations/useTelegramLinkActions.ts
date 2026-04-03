import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { notificationService } from '@/services/notification.service'

interface TelegramLinkTokenResponse {
  botUsername: string
  deepLink: string
  expiresInSeconds: number
}

export function useTelegramLinkActions() {
  const [loadingCreateLink, setLoadingCreateLink] = useState(false)
  const [loadingUnlink, setLoadingUnlink] = useState(false)
  const queryClient = useQueryClient()

  const createLinkToken = async (): Promise<TelegramLinkTokenResponse> => {
    setLoadingCreateLink(true)
    try {
      const result = await notificationService.createTelegramLinkToken()
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể tạo link Telegram')
      throw err
    } finally {
      setLoadingCreateLink(false)
    }
  }

  const unlinkTelegram = async (): Promise<{ revoked: boolean }> => {
    setLoadingUnlink(true)
    try {
      const result = await notificationService.unlinkTelegram()
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.telegramStatus() })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferences() })
      toast.success('Đã hủy liên kết Telegram')
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hủy liên kết Telegram thất bại')
      throw err
    } finally {
      setLoadingUnlink(false)
    }
  }

  return {
    createLinkToken,
    unlinkTelegram,
    loadingCreateLink,
    loadingUnlink,
  }
}
