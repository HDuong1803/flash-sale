import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { AxiosInstance } from 'axios'
import {
  GHNApiResponse,
  GHNDistrict,
  GHNError,
  GHNProvince,
  GHNWard
} from './ghn.types'

/** TTL cho in-memory cache tỉnh/quận/phường (30 phút) */
const ADDRESS_CACHE_TTL_MS = 30 * 60 * 1_000

/** Timeout cho address API calls (master data thường nhanh) */
const ADDRESS_REQUEST_TIMEOUT_MS = 10_000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * GHNAddressService — Service cho GHN address master data.
 *
 * Cung cấp:
 * - getProvinces(): Lấy tất cả tỉnh/thành phố
 * - getDistricts(provinceId): Lấy quận/huyện theo tỉnh
 * - getWards(districtId): Lấy phường/xã theo quận
 * - validateWardCode(wardCode, districtId): Kiểm tra phường thuộc quận
 *
 * Cache in-memory để tránh gọi API lặp lại (address data ít thay đổi).
 */
@Injectable()
export class GHNAddressService implements OnModuleInit {
  private readonly logger = new Logger(GHNAddressService.name)
  private axiosInstance!: AxiosInstance

  /** Cache tỉnh (global) */
  private provincesCache: CacheEntry<GHNProvince[]> | null = null
  /** Cache quận theo provinceId */
  private readonly districtsCache = new Map<number, CacheEntry<GHNDistrict[]>>()
  /** Cache phường theo districtId */
  private readonly wardsCache = new Map<number, CacheEntry<GHNWard[]>>()

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {}

  onModuleInit(): void {
    const isSandbox =
      this.configService.get<string>('ghn.GHN_SANDBOX', 'true') === 'true'
    const baseUrl = isSandbox
      ? 'https://dev-online-gateway.ghn.vn/shiip/public-api'
      : 'https://online-gateway.ghn.vn/shiip/public-api'

    const apiKey = this.configService.get<string>('ghn.GHN_API_KEY', '')

    this.axiosInstance = this.httpService.axiosRef
    this.axiosInstance.defaults.baseURL = baseUrl
    this.axiosInstance.defaults.timeout = ADDRESS_REQUEST_TIMEOUT_MS
    this.axiosInstance.defaults.headers.common['Token'] = apiKey
    this.axiosInstance.defaults.headers.common['Content-Type'] =
      'application/json'
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  async getProvinces(): Promise<GHNProvince[]> {
    const cached = this.provincesCache
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data
    }

    const data = await this.get<GHNProvince[]>('/master-data/province')
    this.provincesCache = {
      data,
      expiresAt: Date.now() + ADDRESS_CACHE_TTL_MS
    }
    return data
  }

  async getDistricts(provinceId: number): Promise<GHNDistrict[]> {
    const cached = this.districtsCache.get(provinceId)
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data
    }

    const data = await this.post<GHNDistrict[]>('/master-data/district', {
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
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data
    }

    const data = await this.post<GHNWard[]>('/master-data/ward', {
      district_id: districtId
    })
    this.wardsCache.set(districtId, {
      data,
      expiresAt: Date.now() + ADDRESS_CACHE_TTL_MS
    })
    return data
  }

  /**
   * validateWardCode — Kiểm tra ward_code có thuộc district_id không.
   *
   * Dùng để validate địa chỉ trước khi tạo đơn GHN.
   * Nếu GHN API lỗi → trả về true (không block fulfillment init).
   */
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
      return true // Không block nếu API lỗi
    }
  }

  // ─── Private HTTP helpers ─────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    try {
      const response = await this.axiosInstance.get<GHNApiResponse<T>>(path)
      return this.unwrap(response.data, `GET ${path}`)
    } catch (err: unknown) {
      throw this.wrapError(err, `GET ${path}`)
    }
  }

  private async post<T>(path: string, data: unknown): Promise<T> {
    try {
      const response = await this.axiosInstance.post<GHNApiResponse<T>>(
        path,
        data
      )
      return this.unwrap(response.data, `POST ${path}`)
    } catch (err: unknown) {
      throw this.wrapError(err, `POST ${path}`)
    }
  }

  private unwrap<T>(response: GHNApiResponse<T>, context: string): T {
    if (response.code !== 200) {
      throw new GHNError(
        response.message ?? `GHN error ${response.code}`,
        response.code_message ?? `GHN_${response.code}`,
        response.code,
        response
      )
    }
    if (response.data === null) {
      throw new GHNError(`GHN ${context} returned null data`, 'NULL_DATA', 200)
    }
    return response.data
  }

  private wrapError(err: unknown, context: string): GHNError {
    if (err instanceof GHNError) return err

    const axiosErr = err as {
      response?: {
        status: number
        data?: GHNApiResponse<unknown>
      }
      message?: string
    }

    if (axiosErr.response) {
      const status = axiosErr.response.status
      const body = axiosErr.response.data
      const message = body?.message ?? `GHN API error (HTTP ${status})`
      const code = body?.code_message ?? `HTTP_${status}`
      this.logger.error(`GHN ${context} failed: [${code}] ${message}`)
      return new GHNError(message, code, status, body)
    }

    const message = axiosErr.message ?? 'GHN network error'
    this.logger.error(`GHN ${context} network error: ${message}`)
    return new GHNError(message, 'NETWORK_ERROR', 0)
  }
}
