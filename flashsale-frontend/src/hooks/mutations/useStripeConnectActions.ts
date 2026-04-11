import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { merchantService } from '@/services/merchant.service'
import type { StripeConnectStatusResponse } from '@/types'

export function useStripeConnectActions() {
  const queryClient = useQueryClient()
  const [loadingConnect, setLoadingConnect] = useState(false)
  const [loadingSync, setLoadingSync] = useState(false)
  const [loadingDashboard, setLoadingDashboard] = useState(false)

  const initiateConnect = async (): Promise<{ onboardingUrl: string }> => {
    setLoadingConnect(true)
    try {
      const result = await merchantService.initiateStripeConnect()
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể khởi tạo kết nối Stripe')
      throw err
    } finally {
      setLoadingConnect(false)
    }
  }

  const syncConnect = async (): Promise<StripeConnectStatusResponse> => {
    setLoadingSync(true)
    try {
      const result = await merchantService.syncStripeConnect()
      queryClient.setQueryData(queryKeys.merchants.stripeConnectStatus(), result)
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể đồng bộ trạng thái Stripe')
      throw err
    } finally {
      setLoadingSync(false)
    }
  }

  const getDashboardLink = async (): Promise<{ url: string }> => {
    setLoadingDashboard(true)
    try {
      return await merchantService.getStripeDashboardLink()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể mở Stripe Dashboard')
      throw err
    } finally {
      setLoadingDashboard(false)
    }
  }

  const invalidateStatus = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.merchants.stripeConnectStatus() })
  }

  return {
    initiateConnect,
    syncConnect,
    getDashboardLink,
    invalidateStatus,
    loadingConnect,
    loadingSync,
    loadingDashboard,
  }
}
