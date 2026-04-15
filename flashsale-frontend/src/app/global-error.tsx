'use client'

/**
 * Global Error Boundary cho Next.js App Router.
 *
 * File này được Next.js gọi tự động khi có unhandled error ở bất kỳ page/layout nào
 * — kể cả root layout.tsx. Đây là "lưới an toàn cuối cùng" của ứng dụng.
 *
 * Tích hợp Sentry: mỗi lần component này render, exception được capture lên Sentry
 * kèm toàn bộ context (user, breadcrumbs, Session Replay nếu đã có replay session).
 * Đội ops sẽ nhận alert trong vài giây sau khi lỗi xảy ra.
 *
 * PHẢI render <html> và <body> vì file này thay thế root layout khi có lỗi.
 */
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Capture lên Sentry — Sentry tự động đính kèm:
    // user identity, breadcrumbs trước đó, Session Replay snapshot
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="vi">
      <body style={{ background: 'linear-gradient(135deg, #08071a, #0f0a2a, #0a1030)', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '28rem',
            width: '100%',
            textAlign: 'center',
          }}>
            {/* Icon */}
            <div style={{
                      width: '5rem', height: '5rem', borderRadius: '50%',
                      background: 'rgba(239, 68, 68, 0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 1.5rem',
                    }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    </div>

                    {/* Message */}
                    <h1 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                      Ứng dụng gặp lỗi nghiêm trọng
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                      Vui lòng tải lại trang. Đội kỹ thuật đã được thông báo tự động.
                    </p>

                    {/* Error digest — hỗ trợ ops team tìm nhanh trong Sentry */}
                    {error.digest && (
                      <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.7rem', fontFamily: 'monospace', marginBottom: '1.5rem' }}>
                        ID: {error.digest}
                      </p>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <button
                        onClick={reset}
                        style={{
                          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                          border: 'none',
                          color: 'white',
                          padding: '0.75rem 1.5rem',
                          borderRadius: '0.75rem',
                        }}
                      >Tải lại trang</button>
                      <Link href="/" style={{ color: '#a5b4fc', textDecoration: 'underline', fontSize: '0.9rem' }}>Về trang chủ</Link>
                    </div>
                  </div>
                </div>
              </body>
            </html>
  )
}
