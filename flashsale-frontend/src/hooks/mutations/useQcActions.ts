'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { fulfillmentService } from '@/services/fulfillment.service'
import type { QcCheckpoint, FulfillmentOrder } from '@/types'
import type { PassQcDto, FailQcDto } from '@/services/fulfillment.service'

export function useQcActions(onSuccess?: () => void) {
  const [loading, setLoading] = useState(false)

  const passQc = async (orderId: string, data: PassQcDto): Promise<QcCheckpoint | null> => {
    setLoading(true)
    try {
      const result = await fulfillmentService.passQc(orderId, data)
      toast.success('QC đạt — đơn hàng sẵn sàng đặt vận chuyển')
      onSuccess?.()
      return result
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'QC thất bại')
      return null
    } finally {
      setLoading(false)
    }
  }

  const failQc = async (orderId: string, data: FailQcDto): Promise<QcCheckpoint | null> => {
    setLoading(true)
    try {
      const result = await fulfillmentService.failQc(orderId, data)
      toast.warning('Đã đánh dấu không đạt QC')
      onSuccess?.()
      return result
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không thể cập nhật QC')
      return null
    } finally {
      setLoading(false)
    }
  }

  const reworkQc = async (orderId: string, note?: string): Promise<QcCheckpoint | null> => {
    setLoading(true)
    try {
      const result = await fulfillmentService.reworkQc(orderId, note)
      toast.info('Đã yêu cầu làm lại QC')
      onSuccess?.()
      return result
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không thể cập nhật QC')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { passQc, failQc, reworkQc, loading }
}

export function useBookLabel(onSuccess?: (fulfillment: FulfillmentOrder) => void) {
  const [loading, setLoading] = useState(false)

  const bookLabel = async (
    orderId: string,
    opts?: { weightGrams?: number }
  ): Promise<FulfillmentOrder | null> => {
    setLoading(true)
    try {
      const result = await fulfillmentService.bookLabel(orderId, opts)
      toast.success('Đã tạo vận đơn GHN thành công')
      onSuccess?.(result)
      return result
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không thể tạo vận đơn')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { bookLabel, loading }
}
