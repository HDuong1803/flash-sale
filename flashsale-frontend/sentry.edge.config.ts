/**
 * Sentry edge runtime configuration — chạy trong Vercel Edge / Cloudflare Workers.
 *
 * Edge runtime có nhiều hạn chế hơn Node.js (không có filesystem, không có native modules).
 * Giữ config tối giản, không dùng profiling hay heavy integrations.
 *
 * Trong dự án này, middleware.ts chạy trên edge runtime (route protection).
 */
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE,

  enabled: !!process.env.SENTRY_DSN,

  // Edge: rate thấp hơn vì có thể nhận rất nhiều request
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
})
