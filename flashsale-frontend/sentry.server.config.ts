/**
 * Sentry server-side configuration — chạy trong Node.js (Next.js server components, API routes).
 *
 * Server-side không có Session Replay (không có browser).
 * Tập trung vào: exception tracking + performance tracing cho server components.
 */
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE,

  enabled: !!process.env.SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Server-side: không cần Session Replay, không cần browser integrations
  integrations: [],
})
