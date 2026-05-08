import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Ghn } from 'giaohangnhanh'
import { GHNDistrict, GHNError, GHNProvince, GHNWard } from './ghn.types'

const ADDRESS_CACHE_TTL_MS = 30 * 60 * 1_000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * GHNAddressService — Service cho GHN address master data.
 *
 * Sử dụng giaohangnhanh npm package để lấy dữ liệu địa chỉ.
 * Cache in-memory để tránh gọi API lặp lại (30 phút TTL).
 */
@Injectable()
export class GHNAddressService implements OnModuleInit {
  private readonly logger = new Logger(GHNAddressService.name)
  private ghn!: Ghn

  private provincesCache: CacheEntry<GHNProvince[]> | null = null
  private readonly districtsCache = new Map<number, CacheEntry<GHNDistrict[]>>()
  private readonly wardsCache = new Map<number, CacheEntry<GHNWard[]>>()

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('ghn.GHN_API_KEY', '')
    const shopId = parseInt(
      this.configService.get<string>('ghn.GHN_SHOP_ID', '0'),
      10
    )
    const isSandbox =
      this.configService.get<string>('ghn.GHN_SANDBOX', 'true') === 'true'

    this.ghn = new Ghn({
      token: apiKey,
      shopId,
      host: isSandbox
        ? 'https://dev-online-gateway.ghn.vn'
        : 'https://online-gateway.ghn.vn',
      testMode: isSandbox
    })
  }

  async getProvinces(): Promise<GHNProvince[]> {
    const cached = this.provincesCache
    if (cached && Date.now() < cached.expiresAt) return cached.data

    try {
      const data = await this.ghn.address.getProvinces()
      const mapped: GHNProvince[] = data.map(p => ({
        ProvinceID: p.ProvinceID,
        ProvinceName: p.ProvinceName,
        Code: p.Code,
        NameExtension: p.NameExtension,
        Status: p.Status,
        CanUpdateCOD: false
      }))
      this.provincesCache = {
        data: mapped,
        expiresAt: Date.now() + ADDRESS_CACHE_TTL_MS
      }
      return mapped
    } catch (err: unknown) {
      throw this.wrapError(err, 'getProvinces')
    }
  }

  async getDistricts(provinceId: number): Promise<GHNDistrict[]> {
    const cached = this.districtsCache.get(provinceId)
    if (cached && Date.now() < cached.expiresAt) return cached.data

    try {
      const data = await this.ghn.address.getDistricts(provinceId)
      const mapped: GHNDistrict[] = data.map(d => ({
        DistrictID: d.DistrictID,
        ProvinceID: d.ProvinceID,
        DistrictName: d.DistrictName,
        Code: d.Code,
        Type: d.Type,
        SupportType: d.SupportType,
        NameExtension: d.NameExtension,
        Status: d.Status,
        CanUpdateCOD: d.CanUpdateCOD
      }))
      this.districtsCache.set(provinceId, {
        data: mapped,
        expiresAt: Date.now() + ADDRESS_CACHE_TTL_MS
      })
      return mapped
    } catch (err: unknown) {
      throw this.wrapError(err, `getDistricts(${provinceId})`)
    }
  }

  async getWards(districtId: number): Promise<GHNWard[]> {
    const cached = this.wardsCache.get(districtId)
    if (cached && Date.now() < cached.expiresAt) return cached.data

    try {
      const data = await this.ghn.address.getWards(districtId)
      const mapped: GHNWard[] = data.map(w => ({
        WardCode: w.WardCode,
        DistrictID: w.DistrictID,
        WardName: w.WardName,
        NameExtension: w.NameExtension,
        Status: w.Status,
        CanUpdateCOD: w.CanUpdateCOD
      }))
      this.wardsCache.set(districtId, {
        data: mapped,
        expiresAt: Date.now() + ADDRESS_CACHE_TTL_MS
      })
      return mapped
    } catch (err: unknown) {
      throw this.wrapError(err, `getWards(${districtId})`)
    }
  }

  async validateWardCode(
    wardCode: string,
    districtId: number
  ): Promise<boolean> {
    try {
      const wards = await this.getWards(districtId)
      return wards.some(w => w.WardCode === wardCode)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(
        `Ward validation failed for ward=${wardCode}, district=${districtId}: ${message}`
      )
      return true
    }
  }

  private wrapError(err: unknown, context: string): GHNError {
    if (err instanceof GHNError) return err
    const message = err instanceof Error ? err.message : String(err)
    this.logger.error(`GHN address ${context} thất bại: ${message}`)
    return new GHNError(message, 'GHN_ADDRESS_ERROR', 0)
  }
}
