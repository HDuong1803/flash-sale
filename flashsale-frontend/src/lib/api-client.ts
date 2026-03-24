import axios, { AxiosInstance, AxiosError } from 'axios'
import * as Sentry from '@sentry/nextjs'

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

/** Map HTTP status codes to readable error codes for ApiError.code. */
function statusToCode(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  }
  return map[status] ?? 'API_ERROR'
}

/**
 * All requests use withCredentials so the browser includes HttpOnly cookies
 * (access_token, refresh_token) automatically. No manual token attachment needed.
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// ─── Response interceptor ────────────────────────────────────────────────────

let isRefreshing = false
let failQueue: Array<{ resolve: () => void; reject: (e: unknown) => void }> = []

/**
 * Backend SUCCESS shape  (ResponseInterceptor):
 *   { result: T, success: true, message: string, count: number }
 *
 * Backend ERROR shape  (GlobalExceptionFilter):
 *   { success: false, message: string, data: null, timestamp: string, path: string }
 */
type BackendSuccess<T = unknown> = {
  result: T
  success: true
  message: string
  count: number
}
type BackendError = {
  success: false
  message: string
  data: null
  timestamp: string
  path: string
}

function isBackendSuccess(raw: unknown): raw is BackendSuccess {
  return (
    raw !== null &&
    typeof raw === 'object' &&
    (raw as Record<string, unknown>)['success'] === true &&
    'result' in (raw as Record<string, unknown>)
  )
}

apiClient.interceptors.request.use((config) => {
  // Thêm breadcrumb mỗi khi gọi API — giúp Sentry tái hiện sequence of events
  // trước khi lỗi xảy ra. Chỉ log method + URL, không log body/headers nhạy cảm.
  Sentry.addBreadcrumb({
    category: 'api.request',
    message: `${config.method?.toUpperCase()} ${config.url}`,
    level: 'info',
    data: { method: config.method, url: config.url },
  })
  return config
})

apiClient.interceptors.response.use(
  (res) => {
    // Always unwrap { result, success, message, count } → result
    if (isBackendSuccess(res.data)) return res.data.result
    // Non-standard response (e.g. health check, raw passthrough) — return as-is
    return res.data
  },

  async (error: AxiosError<BackendError>) => {
    const original = error.config as typeof error.config & { _retry?: boolean }
    const status = error.response?.status ?? 0

    // Breadcrumb cho lỗi API — giúp trace flow dẫn đến lỗi
    Sentry.addBreadcrumb({
      category: 'api.error',
      message: `${original?.method?.toUpperCase()} ${original?.url} → ${status}`,
      level: status >= 500 ? 'error' : 'warning',
      data: { status, url: original?.url, method: original?.method },
    })

    // Capture lên Sentry với đầy đủ context: chỉ 5xx (lỗi server thực sự)
    // 4xx là lỗi của client (validation, auth, not found) — không phải bug
    if (status >= 500) {
      Sentry.captureException(error, {
        tags: {
          'api.status': status,
          'api.url': original?.url ?? 'unknown',
          'api.method': original?.method?.toUpperCase() ?? 'unknown',
        },
        extra: {
          responseData: error.response?.data,
        },
      })
    }

    // On 401: attempt a silent token refresh via the refresh_token HttpOnly cookie.
    const isAuthEndpoint = original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/register') ||
      original?.url?.includes('/auth/refresh')
    if (status === 401 && !original._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise<unknown>((resolve, reject) =>
          failQueue.push({
            resolve: () => resolve(apiClient(original)),
            reject,
          }),
        )
      }

      original._retry = true
      isRefreshing = true

      try {
        await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
        failQueue.forEach((q) => q.resolve())
        failQueue = []
        return apiClient(original)
      } catch {
        failQueue.forEach((q) => q.reject(error))
        failQueue = []
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('auth:force-logout'))
        }
        throw new ApiError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn')
      } finally {
        isRefreshing = false
      }
    }

    // All other errors — read the flat message field from the error shape
    const message = error.response?.data?.message ?? 'Có lỗi xảy ra'
    throw new ApiError(status, statusToCode(status), message)
  },
)

// ─── Retry helper (GET-only) ─────────────────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 2000,
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (err instanceof ApiError && err.statusCode >= 400 && err.statusCode < 500) throw err
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastError
}

export default apiClient
