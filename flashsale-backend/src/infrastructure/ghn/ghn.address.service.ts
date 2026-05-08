import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GHNDistrict, GHNError, GHNProvince, GHNWard } from './ghn.types'

const ADDRESS_CACHE_TTL_MS = 30 * 60 * 1_000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

interface GHNAddressResponse<T> {
  code: number
  message: string
  data: T | null
}

/**
 * GHNAddressService — Lấy địa chỉ master data từ GHN production API.
 */
@Injectable()
export class GHNAddressService implements OnModuleInit {
  private readonly logger = new Logger(GHNAddressService.name)
  private readonly baseUrl =
    'https://online-gateway.ghn.vn/shiip/public-api/master-data'
  private apiKey = ''

  private provincesCache: CacheEntry<GHNProvince[]> | null = null
  private readonly districtsCache = new Map<number, CacheEntry<GHNDistrict[]>>()
  private readonly wardsCache = new Map<number, CacheEntry<GHNWard[]>>()

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const addressKey = this.configService.get<string>(
      'ghn.GHN_ADDRESS_API_KEY',
      ''
    )
    this.apiKey =
      addressKey || this.configService.get<string>('ghn.GHN_API_KEY', '')
    this.logger.log(
      `GHNAddressService initialized — production URL, key: ${
        this.apiKey ? '***' + this.apiKey.slice(-4) : 'MISSING'
      }`
    )
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  async getProvinces(): Promise<GHNProvince[]> {
    const cached = this.provincesCache
    if (cached && Date.now() < cached.expiresAt) return cached.data

    const data = await this.get<GHNProvince[]>('/province')
    this.provincesCache = { data, expiresAt: Date.now() + ADDRESS_CACHE_TTL_MS }
    return data
  }

  async getDistricts(provinceId: number): Promise<GHNDistrict[]> {
    const cached = this.districtsCache.get(provinceId)
    if (cached && Date.now() < cached.expiresAt) return cached.data

    const data = await this.post<GHNDistrict[]>('/district', {
      province_id: provinceId
    })
    this.districtsCache.set(provinceId, {
      data,
      expiresAt: Date.now() + ADDRESS_CACHE_TTL_MS
    })
    return data
  }

  async getWards(districtId: number): Promise<GHNWard[]> {
    const cached = this.wardsCache.get(districtId)
    if (cached && Date.now() < cached.expiresAt) return cached.data

    const data = await this.post<GHNWard[]>('/ward', {
      district_id: districtId
    })
    this.wardsCache.set(districtId, {
      data,
      expiresAt: Date.now() + ADDRESS_CACHE_TTL_MS
    })
    return data
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

  // ─── Private HTTP helpers (Token-only, no ShopId) ─────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: { Token: this.apiKey, 'Content-Type': 'application/json' }
    })
    return this.unwrap<T>((await res.json()) as GHNAddressResponse<T>, path)
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Token: this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return this.unwrap<T>((await res.json()) as GHNAddressResponse<T>, path)
  }

  private unwrap<T>(response: GHNAddressResponse<T>, context: string): T {
    if (response.code !== 200 || response.data === null) {
      const msg =
        response.message ?? `GHN address error (code ${response.code})`
      this.logger.error(`GHN address ${context}: ${msg}`)
      throw new GHNError(msg, 'GHN_ADDRESS_ERROR', response.code)
    }
    return response.data
  }
}
