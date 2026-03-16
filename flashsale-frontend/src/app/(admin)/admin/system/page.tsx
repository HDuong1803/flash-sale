'use client'

import { useState, useEffect, useCallback } from 'react'
import { Server, Database, Layers, MessageSquare, AlertCircle, RotateCcw } from 'lucide-react'
import { useSystemHealth } from '@/hooks/queries/useSystemHealth'

const SERVICE_CONFIG = [
  { key: 'postgres' as const, label: 'PostgreSQL', icon: Database, desc: 'Cơ sở dữ liệu chính' },
  { key: 'redis' as const, label: 'Redis', icon: Layers, desc: 'Cache & Queue' },
  { key: 'rabbitmq' as const, label: 'RabbitMQ', icon: MessageSquare, desc: 'Message Broker' },
  { key: 'api' as const, label: 'API Server', icon: Server, desc: 'Backend REST API' },
]

export default function AdminSystemPage() {
  const { data: health, loading, error, refetch } = useSystemHealth()
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  const doRefresh = useCallback(() => {
    refetch()
    setLastRefresh(Date.now())
  }, [refetch])

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(doRefresh, 60000)
    return () => clearInterval(interval)
  }, [doRefresh])

  // Suppress unused variable warning
  void lastRefresh

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Giám sát hệ thống</h1>
          <p className="text-white/40 text-sm mt-1">Tự động làm mới mỗi 60 giây</p>
        </div>
        <button onClick={doRefresh} className="btn-glass flex items-center gap-2 text-sm">
          <RotateCcw size={14} /> Làm mới
        </button>
      </div>

      {/* Health unavailable banner */}
      {error && (
        <div className="glass rounded-xl p-4 border border-orange-500/20 flex items-center gap-3">
          <AlertCircle size={18} className="text-orange-400 flex-shrink-0" />
          <p className="text-orange-300 text-sm">Không thể kết nối đến máy chủ giám sát</p>
          <button onClick={doRefresh} className="btn-glass text-xs px-3 py-1.5 ml-auto">Thử lại</button>
        </div>
      )}

      {/* Health cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SERVICE_CONFIG.map(({ key, label, icon: Icon, desc }) => {
          const isUp = health?.[key] === 'UP'
          const isLoading = loading && !health
          return (
            <div key={key} className={`glass rounded-2xl p-6 space-y-3 ${!isLoading && !isUp && health ? 'border-red-500/30' : ''}`}>
              {isLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="bg-white/8 h-6 w-1/2 rounded" />
                  <div className="bg-white/8 h-4 w-1/3 rounded" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${isUp ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                        <Icon size={18} className={isUp ? 'text-emerald-400' : 'text-red-400'} />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{label}</p>
                        <p className="text-white/40 text-xs">{desc}</p>
                      </div>
                    </div>
                    <span className={`w-3 h-3 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-red-400 animate-live'}`} />
                  </div>
                  <p className={`text-sm font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {health ? (isUp ? 'Hoạt động bình thường' : 'Không kết nối được') : '—'}
                  </p>
                  {!isUp && health && (
                    <button className="btn-glass text-xs py-1.5 text-red-300">Kiểm tra logs</button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Queue metrics placeholder */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">Hàng đợi xử lý</h2>
        <div className="flex items-center justify-center h-32 text-white/30 text-sm">
          Dữ liệu hàng đợi sẽ hiển thị khi kết nối đến backend
        </div>
      </div>

      {/* Error log placeholder */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold">Error Logs</h2>
        </div>
        <div className="p-6 text-center text-white/30 text-sm">
          Logs sẽ hiển thị khi có kết nối đến backend
        </div>
      </div>
    </div>
  )
}
