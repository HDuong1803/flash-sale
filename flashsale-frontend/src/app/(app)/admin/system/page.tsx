'use client'

import { useState, useEffect, useCallback } from 'react'
import { Server, Database, Layers, MessageSquare, AlertCircle, RotateCcw } from 'lucide-react'
import { useSystemHealth } from '@/hooks/queries/useSystemHealth'
import { useQueueStats } from '@/hooks/queries/useQueueStats'
import { useSystemLogs } from '@/hooks/queries/useSystemLogs'
import { usePaymentGatewayConfigs } from '@/hooks/queries/usePaymentGatewayConfigs'
import { useUpdatePaymentGatewayConfig } from '@/hooks/mutations/useUpdatePaymentGatewayConfig'
import { useAdminStream } from '@/hooks/useAdminStream'
import { formatDate } from '@/lib/utils'
import type { PaymentGatewayConfig } from '@/types'

const SERVICE_CONFIG = [
  { key: 'postgres' as const, label: 'PostgreSQL', icon: Database, desc: 'Cơ sở dữ liệu chính' },
  { key: 'redis' as const, label: 'Redis', icon: Layers, desc: 'Bộ nhớ đệm và hàng đợi' },
  { key: 'rabbitmq' as const, label: 'RabbitMQ', icon: MessageSquare, desc: 'Bộ điều phối tin nhắn' },
  { key: 'api' as const, label: 'Máy chủ API', icon: Server, desc: 'API REST phía máy chủ' },
]

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'bg-red-500/15 text-red-300 border-red-500/20',
  WARN: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
  INFO: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
}

function queueColor(count: number) {
  if (count > 500) return 'bg-red-500'
  if (count > 100) return 'bg-yellow-500'
  return 'bg-emerald-500'
}

export default function AdminSystemPage() {
  const { data: health, loading, error, refetch } = useSystemHealth()
  const { data: queueStats, loading: queueLoading, error: queueError, refetch: refetchQueue } = useQueueStats()
  const { data: logs, loading: logsLoading, error: logsError, refetch: refetchLogs } = useSystemLogs()
  const { data: gateways, loading: gatewayLoading } = usePaymentGatewayConfigs()
  const { updateGateway, loading: updatingGateway } = useUpdatePaymentGatewayConfig()
  const { connected: streamConnected } = useAdminStream()
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({})

  // health và queue stats được cập nhật realtime qua SSE (useAdminStream)
  const doRefresh = useCallback(() => {
    refetch()
    refetchQueue()
    refetchLogs()
  }, [refetch, refetchQueue, refetchLogs])

  useEffect(() => {
    const initialNames: Record<string, string> = {}
    for (const item of gateways) initialNames[item.gateway] = item.displayName
    setDisplayNames(initialNames)
  }, [gateways])

  const onToggleEnabled = async (gateway: PaymentGatewayConfig) => {
    await updateGateway(gateway.gateway, { enabled: !gateway.enabled })
  }

  const onSetDefault = async (gateway: PaymentGatewayConfig) => {
    await updateGateway(gateway.gateway, { isDefault: true, enabled: true })
  }

  const onSaveDisplayName = async (gateway: PaymentGatewayConfig) => {
    const next = displayNames[gateway.gateway]?.trim()
    if (!next || next === gateway.displayName) return
    await updateGateway(gateway.gateway, { displayName: next })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Giám sát hệ thống</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-2 h-2 rounded-full ${streamConnected ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
            <p className={`text-sm ${streamConnected ? 'text-emerald-400' : 'text-white/40'}`}>
              {streamConnected ? 'Đang theo dõi trực tiếp' : 'Đang kết nối...'}
            </p>
          </div>
        </div>
        <button onClick={doRefresh} className="btn-glass flex items-center gap-2 text-sm">
          <RotateCcw size={14} /> Làm mới
        </button>
      </div>

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
                    <button className="btn-glass text-xs py-1.5 text-red-300">Kiểm tra nhật ký</button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Queue metrics */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Hàng đợi xử lý</h2>
          {queueError && (
            <button onClick={refetchQueue} className="btn-glass text-xs px-3 py-1.5">Thử lại</button>
          )}
        </div>
        {queueLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="bg-white/8 h-12 rounded-xl" />
            <div className="bg-white/8 h-12 rounded-xl" />
          </div>
        ) : queueError ? (
          <p className="text-white/40 text-sm text-center py-4">Không thể tải dữ liệu hàng đợi</p>
        ) : (
          <div className="space-y-4">
            {[
              { label: 'Đơn hàng ưu tiên cao', value: queueStats?.high ?? 0 },
              { label: 'Đơn hàng ưu tiên thường', value: queueStats?.normal ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">{label}</span>
                  <span className="text-white font-semibold">{value} mục</span>
                </div>
                <div className="h-2 glass rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${queueColor(value)}`}
                    style={{ width: `${Math.min((value / 1000) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment gateway configs */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">Cấu hình cổng thanh toán</h2>
          <p className="text-white/40 text-xs">Áp dụng ngay cho luồng thanh toán</p>
        </div>
        {gatewayLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-16 rounded-xl bg-white/8" />
            <div className="h-16 rounded-xl bg-white/8" />
          </div>
        ) : gateways.length === 0 ? (
          <p className="text-sm text-white/50">Chưa có cấu hình cổng thanh toán.</p>
        ) : (
          <div className="space-y-3">
            {gateways.map((gateway) => (
              <div key={gateway.gateway} className="glass rounded-xl p-4 border border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white font-medium">{gateway.gateway}</p>
                    <p className="text-white/40 text-xs">{gateway.displayName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {gateway.isDefault && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Mặc định
                      </span>
                    )}
                    <button
                      onClick={() => onToggleEnabled(gateway)}
                      disabled={updatingGateway}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${
                        gateway.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-white/5 text-white/70 border-white/20'
                      }`}
                    >
                      {gateway.enabled ? 'Đang bật' : 'Đang tắt'}
                    </button>
                    <button
                      onClick={() => onSetDefault(gateway)}
                      disabled={updatingGateway || !gateway.enabled}
                      className="btn-glass text-xs px-3 py-1.5 disabled:opacity-50"
                    >
                      Đặt mặc định
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={displayNames[gateway.gateway] ?? gateway.displayName}
                    onChange={(e) =>
                      setDisplayNames((prev) => ({ ...prev, [gateway.gateway]: e.target.value }))
                    }
                    className="input-glass text-sm"
                    placeholder="Tên hiển thị cổng thanh toán"
                  />
                  <button
                    onClick={() => onSaveDisplayName(gateway)}
                    disabled={updatingGateway}
                    className="btn-glass text-xs px-3 py-2"
                  >
                    Lưu
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System logs */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white font-semibold">Nhật ký lỗi</h2>
          {logsError && (
            <button onClick={refetchLogs} className="btn-glass text-xs px-3 py-1.5">Thử lại</button>
          )}
        </div>
        {logsLoading ? (
          <div className="divide-y divide-white/5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-6 py-3 animate-pulse">
                <div className="bg-white/8 h-5 w-16 rounded" />
                <div className="bg-white/8 h-5 flex-1 rounded" />
                <div className="bg-white/8 h-5 w-28 rounded" />
              </div>
            ))}
          </div>
        ) : logsError ? (
          <p className="text-white/40 text-sm text-center py-8">Không thể tải nhật ký</p>
        ) : logs.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-8">Không có nhật ký lỗi. Hệ thống hoạt động bình thường.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    {['Thời gian', 'Mức độ', 'Thông báo'].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.slice(0, 50).map((log, i) => (
                    <tr key={i} className="hover:bg-white/3 transition-colors">
                      <td className="px-6 py-3 text-white/40 text-xs font-mono whitespace-nowrap">{formatDate(log.timestamp)}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${LEVEL_COLORS[log.level]}`}>{log.level}</span>
                      </td>
                      <td className="px-6 py-3 text-white/70 text-xs">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logs.length >= 50 && (
              <div className="px-6 py-3 border-t border-white/10 text-center">
                <button onClick={refetchLogs} className="btn-glass text-xs px-4 py-2">Tải thêm</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
