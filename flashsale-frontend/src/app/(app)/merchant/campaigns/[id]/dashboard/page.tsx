'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Wifi, WifiOff, AlertCircle } from 'lucide-react'
import { useSSE } from '@/hooks/useSSE'
import { useCampaign } from '@/hooks/queries/useCampaign'
import { useMyCampaigns } from '@/hooks/queries/useMyCampaigns'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { StockProgressBar } from '@/components/shared/StockProgressBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatCurrency, maskString, cn } from '@/lib/utils'
import type { DashboardMetrics } from '@/types'

interface LiveOrder {
  id: string
  customer: string
  qty: number
  time: string
}

export default function CampaignLiveDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: campaign } = useCampaign(id)
  const { data: myCampaigns } = useMyCampaigns()
  const { data: metrics, connected, error } = useSSE(id)
  const [orderHistory, setOrderHistory] = useState<LiveOrder[]>([])
  const [opsHistory, setOpsHistory] = useState<number[]>(Array(30).fill(0))
  const prevMetrics = useRef<DashboardMetrics | null>(null)

  useEffect(() => {
    if (!metrics) return
    setOpsHistory((prev) => [...prev.slice(1), metrics.ordersPerSecond])
    if (metrics.totalOrders > (prevMetrics.current?.totalOrders ?? 0)) {
      const newOrder: LiveOrder = {
        id: Date.now().toString(),
        customer: `Nguyễn ***`,
        qty: 1,
        time: new Date().toLocaleTimeString('vi-VN'),
      }
      setOrderHistory((prev) => [newOrder, ...prev].slice(0, 50))
    }
    prevMetrics.current = metrics
  }, [metrics])

  const stockRemaining = metrics?.stockRemaining ?? 0
  const stockTotal = metrics?.stockTotal ?? 1
  const stockPct = stockTotal > 0 ? (stockRemaining / stockTotal) * 100 : 0
  // Chỉ báo hết hàng khi đã nhận được data từ SSE (metrics !== null)
  const isSoldOut = metrics !== null && stockRemaining === 0
  const listCampaign = myCampaigns.find((c) => c.id === id)
  const displayStatus = listCampaign?.status ?? campaign?.status

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/merchant/campaigns" className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors">
          <ArrowLeft size={16} /> Quay lại
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-white text-xl font-bold">{campaign?.name ?? 'Bảng điều khiển trực tiếp'}</h1>
            {displayStatus && <StatusBadge status={displayStatus} />}
            <div className={cn('flex items-center gap-1.5 text-xs px-2 py-1 rounded-full', connected ? 'text-emerald-400' : 'text-red-400')}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? 'Kết nối' : 'Mất kết nối'}
            </div>
          </div>
          {campaign && (
            <div className="mt-1">
              <CountdownTimer targetDate={campaign.endTime} size="sm" />
            </div>
          )}
        </div>
      </div>

      {/* SSE error banner */}
      {error && (
        <div className="glass rounded-xl p-4 flex items-center gap-3 border border-orange-500/20">
          <AlertCircle size={18} className="text-orange-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-orange-300 text-sm">{error}</p>
          </div>
          <button onClick={() => window.location.reload()} className="btn-glass text-xs px-3 py-1.5">Thử lại</button>
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stock */}
        <div className={cn('glass rounded-2xl p-5 space-y-3 relative overflow-hidden', stockPct < 20 && !isSoldOut && metrics !== null && 'bg-red-500/5', isSoldOut && 'bg-red-500/10')}>
          <p className="text-white/50 text-sm">Tồn kho còn lại</p>
          {metrics === null ? (
            <div className="h-9 w-20 bg-white/10 rounded-lg animate-pulse" />
          ) : (
            <p className={cn('text-3xl font-bold animate-number-pop', isSoldOut ? 'text-red-400' : stockPct < 20 ? 'text-red-300' : 'text-white')}>
              {stockRemaining.toLocaleString()}
            </p>
          )}
          <StockProgressBar remaining={metrics === null ? 1 : stockRemaining} total={stockTotal} size="sm" />
          {isSoldOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <span className="glass-strong text-red-300 font-bold text-sm px-4 py-2 rounded-xl">HẾT HÀNG</span>
            </div>
          )}
        </div>

        {/* Revenue */}
        <div className="glass rounded-2xl p-5 space-y-3">
          <p className="text-white/50 text-sm">Doanh thu</p>
          <p className="text-2xl font-bold text-emerald-300 animate-number-pop">
            {formatCurrency(metrics?.revenue ?? 0)}
          </p>
          <p className="text-white/30 text-xs">{metrics?.successOrders ?? 0} đơn thành công</p>
        </div>

        {/* Orders/sec */}
        <div className="glass rounded-2xl p-5 space-y-3">
          <p className="text-white/50 text-sm">Đơn / giây</p>
          <p className="text-3xl font-bold text-indigo-300 animate-number-pop">
            {metrics?.ordersPerSecond != null ? metrics.ordersPerSecond.toFixed(1) : '—'}
          </p>
          <div className="flex items-end gap-0.5 h-8">
            {opsHistory.map((v, i) => (
              <div key={i} className="flex-1 bg-indigo-500/40 rounded-sm transition-all" style={{ height: `${Math.min(100, (v / (Math.max(...opsHistory, 1))) * 100)}%` }} />
            ))}
          </div>
        </div>

        {/* Conversion */}
        <div className="glass rounded-2xl p-5 space-y-3">
          <p className="text-white/50 text-sm">Tỷ lệ chuyển đổi</p>
          <p className="text-3xl font-bold text-purple-300 animate-number-pop">
            {metrics?.conversionRate != null ? `${metrics.conversionRate.toFixed(1)}%` : '—'}
          </p>
          <p className="text-white/30 text-xs">{metrics?.queueDepth ?? 0} yêu cầu đang chờ</p>
          {metrics && (
            <div className={cn('text-xs px-2 py-1 rounded-full inline-block', metrics.queueDepth < 100 ? 'bg-emerald-500/20 text-emerald-300' : metrics.queueDepth < 500 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/20 text-red-300')}>
              Hàng đợi: {metrics.queueDepth}
            </div>
          )}
        </div>
      </div>

      {/* Live order feed */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold flex items-center gap-2">
            Đơn hàng trực tiếp
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live" /> Trực tiếp
            </span>
          </h2>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
          {orderHistory.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-8">Không có hoạt động</p>
          ) : (
            orderHistory.map((order) => (
              <div key={order.id} className="px-6 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-emerald-400 text-xs font-bold">✓</span>
                </div>
                <div className="flex-1">
                  <span className="text-white/70 text-sm">{maskString(order.customer)}</span>
                  <span className="text-white/40 text-xs ml-2">× {order.qty}</span>
                </div>
                <span className="bg-emerald-500/15 text-emerald-300 text-xs px-2 py-0.5 rounded-full">ĐÃ CHỐT</span>
                <span className="text-white/30 text-xs">{order.time}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
