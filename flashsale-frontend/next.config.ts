import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
}

/**
 * withSentryConfig: wrap Next.js config để Sentry tự động:
 * 1. Inject Sentry init vào client/server/edge bundles
 * 2. Upload source maps lên Sentry khi build (để stack trace dễ đọc)
 * 3. Ẩn source maps khỏi browser (bảo mật code)
 * 4. Tree-shake Sentry code khi disabled
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
export default withSentryConfig(nextConfig, {
  // ─── Sentry Organization & Project ──────────────────────────────────────
  // Lấy từ: Sentry Dashboard → Settings → General → Organization Slug
  org: process.env.SENTRY_ORG,
  // Tên project trong Sentry (phải khớp với project slug trong dashboard)
  project: process.env.SENTRY_PROJECT,

  // ─── Source Maps ────────────────────────────────────────────────────────
  // Upload source maps để stack trace hiển thị code gốc thay vì minified
  // SENTRY_AUTH_TOKEN: Sentry Dashboard → Settings → Auth Tokens → Create
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Source maps config: ẩn khỏi browser và xoá sau khi upload
  sourcemaps: {
    // Ẩn source maps khỏi browser bundle (tránh lộ code production)
    disable: false,
    // Xoá source maps local sau khi upload (không ship ra CDN/server)
    deleteSourcemapsAfterUpload: true,
  },

  // ─── Build logs ─────────────────────────────────────────────────────────
  // Tắt logger của Sentry CLI khi build local, bật khi chạy CI/CD
  silent: !process.env.CI,

  // Tự động instrument Next.js Server Components và API routes
  autoInstrumentServerFunctions: true,
})
