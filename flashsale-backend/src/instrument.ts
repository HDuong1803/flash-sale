/**
 * Sentry initialization — phải được import TRƯỚC tất cả các module khác.
 *
 * Lý do: Sentry cần patch các module Node.js (http, express, prisma, ...)
 * trước khi chúng được load để auto-instrumentation hoạt động đúng.
 * Nếu import sau NestFactory → nhiều integrations sẽ bị bỏ qua.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nestjs/
 */
import * as Sentry from '@sentry/nestjs'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

Sentry.init({
  // DSN: lấy từ Settings → Projects → Client Keys trong Sentry dashboard
  // Để trống hoặc không set → Sentry tự động disable (an toàn khi dev local)
  dsn: process.env.SENTRY_DSN,

  // Môi trường: giúp filter event theo production / staging / development
  environment: process.env.NODE_ENV ?? 'development',

  // Release: gắn version để track regression giữa các deploy
  // CI/CD nên set: SENTRY_RELEASE=`git rev-parse --short HEAD`
  release: process.env.SENTRY_RELEASE,

  // Chỉ active khi có DSN — không gây lỗi khi chạy local không có Sentry
  enabled: !!process.env.SENTRY_DSN,

  // ─── Performance Monitoring ───────────────────────────────────────────────
  // tracesSampleRate: tỷ lệ request được trace (1.0 = 100%, chi phí cao hơn)
  // Production: 0.1 = 10% để tiết kiệm quota. Dev: 1.0 để debug đầy đủ.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // profilesSampleRate: tỷ lệ trong số các trace được profile CPU
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // ─── Integrations ─────────────────────────────────────────────────────────
  integrations: [
    // CPU profiling — phát hiện bottleneck hiệu năng
    nodeProfilingIntegration()
  ],

  // ─── Error filtering ──────────────────────────────────────────────────────
  /**
   * beforeSend: lọc event TRƯỚC khi gửi lên Sentry.
   * Giúp giảm noise và tiết kiệm quota.
   *
   * Quy tắc: chỉ gửi 5xx (lỗi server thực sự), bỏ qua 4xx (lỗi client).
   * 4xx như 400 (validation), 401 (auth), 404 (not found) không phải bug.
   */
  beforeSend(event) {
    const statusCode = event.tags?.['http.response.status_code']
    if (
      typeof statusCode === 'number' &&
      statusCode >= 400 &&
      statusCode < 500
    ) {
      return null // Bỏ qua 4xx
    }
    return event
  }

  // ─── Thông tin thêm ───────────────────────────────────────────────────────
  // Sentry sẽ tự gửi thêm: server name, OS, Node.js version, package versions
})
