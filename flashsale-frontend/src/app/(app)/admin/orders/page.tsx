'use client'

import { useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import apiClient, { ApiError } from '@/lib/api-client'

export default function AdminOrdersPage() {
  const [data, setData] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTimeout(() => setLoading(true), 0)
    apiClient.get('/admin/orders')
      .then((res) => setData(res as unknown as unknown[]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Quản lý Đơn hàng</h1>
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      )}
      {error && (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm">{error}</p>
        </div>
      )}
      {!loading && !error && (
        <GlassCard className="p-4">
          <p className="text-white/50 text-sm">{data.length} mục</p>
          <pre className="text-xs text-white/30 mt-2 overflow-auto max-h-96">{JSON.stringify(data.slice(0, 3), null, 2)}</pre>
        </GlassCard>
      )}
    </div>
  )
}
