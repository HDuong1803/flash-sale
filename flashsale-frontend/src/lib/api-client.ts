import axios, { AxiosInstance, AxiosError } from 'axios'

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

apiClient.interceptors.response.use(
  (res) => {
    // Always unwrap { result, success, message, count } → result
    if (isBackendSuccess(res.data)) return res.data.result
    // Non-standard response (e.g. health check, raw passthrough) — return as-is
    return res.data
  },

  async (error: AxiosError<BackendError>) => {
    const original = error.config as typeof error.config & { _retry?: boolean }

    // On 401: attempt a silent token refresh via the refresh_token HttpOnly cookie.
    // The browser sends the cookie automatically — no token value is read or stored here.
    if (error.response?.status === 401 && !original._retry) {
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
        // POST /auth/refresh — browser sends refresh_token cookie automatically.
        // Backend validates it and sets a new access_token cookie via Set-Cookie.
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
    const status = error.response?.status ?? 0
    const message =
      error.response?.data?.message ?? 'Có lỗi xảy ra'
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
