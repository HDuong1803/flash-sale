/**
 * Sentry client-side configuration — chạy trong browser.
 *
 * File này được Next.js load tự động nhờ `withSentryConfig` trong next.config.ts.
 * KHÔNG cần import thủ công.
 *
 * Client-side có thêm Session Replay để record lại UX khi có lỗi.
 * Rất hữu ích để debug lỗi payment flow (user làm gì trước khi lỗi xảy ra).
 */
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

  // Chỉ enable khi có DSN — không lỗi khi dev local
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // ─── Performance Tracing ────────────────────────────────────────────────
  // Production: 10% để tiết kiệm quota. Dev: 100% để debug đầy đủ.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // ─── Session Replay ─────────────────────────────────────────────────────
  // Ghi lại màn hình user để tái hiện lỗi — cực kỳ hữu ích cho payment flow.
  // sessionSampleRate: 10% session bình thường (không lỗi)
  // errorSampleRate: 100% session có lỗi — luôn capture khi có exception
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Ẩn text (số tài khoản, tên, ...) để bảo vệ thông tin nhạy cảm
      maskAllText: true,
      // Vẫn hiển thị ảnh sản phẩm, QR code để debug dễ hơn
      blockAllMedia: false,
      // Ẩn input forms (chứa địa chỉ, số điện thoại)
      maskAllInputs: true,
    }),
    // Breadcrumb tự động: ghi lại console.log, fetch, XHR trước khi lỗi xảy ra
    Sentry.breadcrumbsIntegration({
      console: true,
      fetch: true,
      xhr: true,
      sentry: true,
    }),
  ],

  // ─── Error filtering ────────────────────────────────────────────────────
  /**
   * Lọc những lỗi không cần quan tâm:
   * - Network errors khi user offline (không phải bug code)
   * - Third-party scripts lỗi (ads, analytics)
   * - Browser extension errors
   */
  ignoreErrors: [
    // Network/connectivity
    'Network Error',
    'Failed to fetch',
    'Load failed',
    'NetworkError',
    'Request aborted',
    // Browser extension errors
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    // Non-critical UI errors
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
  ],

  /**
   * beforeSend: lọc và làm giàu event trước khi gửi.
   * - Bỏ qua lỗi 401 (user chưa đăng nhập — không phải bug)
   * - Bỏ qua lỗi 404 (trang không tồn tại — thường do user nhập URL sai)
   */
  beforeSend(event, hint) {
    const error = hint.originalException

    // Bỏ qua ApiError 401/404 từ api-client.ts
    if (
      error instanceof Error &&
      error.name === 'ApiError' &&
      /^(401|404)$/.test(error.message.match(/\d{3}/)?.[0] ?? '')
    ) {
      return null
    }

    return event
  },
})
