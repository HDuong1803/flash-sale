'use client'

import { useState, useEffect, useCallback } from 'react'
import { ApiError } from '@/lib/api-client'
import {
  addressService,
  GHNProvince,
  GHNDistrict,
  GHNWard
} from '@/services/address.service'

export function useGHNProvinces() {
  const [data, setData] = useState<GHNProvince[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    addressService
      .getProvinces()
      .then(provinces => {
        if (!cancelled) {
          const sorted = [...provinces].sort((a, b) =>
            a.ProvinceName.localeCompare(b.ProvinceName, 'vi')
          )
          setData(sorted)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách tỉnh/thành phố')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { data, loading, error }
}

export function useGHNDistricts(provinceId: number | null) {
  const [data, setData] = useState<GHNDistrict[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(() => {
    if (!provinceId) {
      setData([])
      return
    }
    setLoading(true)
    setError(null)
    addressService
      .getDistricts(provinceId)
      .then(districts => {
        const sorted = [...districts].sort((a, b) =>
          a.DistrictName.localeCompare(b.DistrictName, 'vi')
        )
        setData(sorted)
      })
      .catch(err => {
        setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách quận/huyện')
        setData([])
      })
      .finally(() => setLoading(false))
  }, [provinceId])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error }
}

export function useGHNWards(districtId: number | null) {
  const [data, setData] = useState<GHNWard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(() => {
    if (!districtId) {
      setData([])
      return
    }
    setLoading(true)
    setError(null)
    addressService
      .getWards(districtId)
      .then(wards => {
        const sorted = [...wards].sort((a, b) =>
          a.WardName.localeCompare(b.WardName, 'vi')
        )
        setData(sorted)
      })
      .catch(err => {
        setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách phường/xã')
        setData([])
      })
      .finally(() => setLoading(false))
  }, [districtId])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error }
}
