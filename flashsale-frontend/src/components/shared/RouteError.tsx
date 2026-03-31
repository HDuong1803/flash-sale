'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'

export function RouteError({
  error,
  reset,
  logPrefix = 'Lỗi tuyến',
  defaultMessage = 'Trang này gặp sự cố. Vui lòng thử lại.',
}: {
  error: Error & { digest?: string }
  reset: () => void
  logPrefix?: string
  defaultMessage?: string
}) {
  useEffect(() => {
    console.error(`${logPrefix}:`, error)
  }, [error, logPrefix])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="glass rounded-2xl p-8 text-center max-w-md">
        <div className="glass rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <AlertCircle className="text-red-400" size={28} />
        </div>
        <h2 className="text-white font-semibold text-lg mb-2">Có lỗi xảy ra</h2>
        <p className="text-white/50 text-sm mb-6">{error.message || defaultMessage}</p>
        <button onClick={reset} className="btn-primary px-6 py-2 text-sm">
          Thử lại
        </button>
      </div>
    </div>
  )
}
