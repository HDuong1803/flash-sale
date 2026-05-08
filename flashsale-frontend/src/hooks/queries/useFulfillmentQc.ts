'use client'

import { useState, useEffect, useCallback } from 'react'
import { ApiError } from '@/lib/api-client'
import { fulfillmentService } from '@/services/fulfillment.service'
import type { FulfillmentOrder, QcCheckpoint } from '@/types'

export function useFulfillmentDetail(orderId: string | null) {
  const [data, setData] = useState<FulfillmentOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)
    try {
      const result = await fulfillmentService.getFulfillmentDetail(orderId)
      setData(result)
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        setData(null)
      } else {
        setError(err instanceof ApiError ? err.message : 'Không thể tải thông tin giao vận')
      }
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function useQcDetail(orderId: string | null) {
  const [data, setData] = useState<QcCheckpoint | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)
    try {
      const result = await fulfillmentService.getQcDetail(orderId)
      setData(result)
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        setData(null)
      } else {
        setError(err instanceof ApiError ? err.message : 'Không thể tải thông tin QC')
      }
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function usePendingQcOrders(limit = 20, offset = 0) {
  const [data, setData] = useState<QcCheckpoint[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fulfillmentService.getPendingQcOrders({ limit, offset })
      setData(result.items)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách QC')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [limit, offset])

  useEffect(() => { fetch() }, [fetch])

  return { data, total, loading, error, refetch: fetch }
}
