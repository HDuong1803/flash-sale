import apiClient, { withRetry } from '@/lib/api-client'

export interface GHNProvince {
  ProvinceID: number
  ProvinceName: string
  Code: string
}

export interface GHNDistrict {
  DistrictID: number
  ProvinceID: number
  DistrictName: string
}

export interface GHNWard {
  WardCode: string
  DistrictID: number
  WardName: string
}

class AddressService {
  getProvinces(): Promise<GHNProvince[]> {
    return withRetry(() => apiClient.get('/address/provinces'))
  }

  getDistricts(provinceId: number): Promise<GHNDistrict[]> {
    return withRetry(() => apiClient.get(`/address/districts?provinceId=${provinceId}`))
  }

  getWards(districtId: number): Promise<GHNWard[]> {
    return withRetry(() => apiClient.get(`/address/wards?districtId=${districtId}`))
  }
}

export const addressService = new AddressService()
