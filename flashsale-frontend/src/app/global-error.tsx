'use client'

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html>
      <body style={{ background: 'linear-gradient(135deg, #08071a, #0f0a2a, #0a1030)', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'white', padding: '2rem' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              Ứng dụng gặp lỗi nghiêm trọng
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              Vui lòng tải lại trang để tiếp tục.
            </p>
            <button
              onClick={reset}
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                border: 'none',
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
