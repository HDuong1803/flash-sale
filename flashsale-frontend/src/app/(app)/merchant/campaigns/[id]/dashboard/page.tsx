'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Wifi, WifiOff, AlertCircle, ExternalLink } from 'lucide-react'
import { useSSE } from '@/hooks/useSSE'
import { useCampaign } from '@/hooks/queries/useCampaign'
import { useMyCampaigns } from '@/hooks/queries/useMyCampaigns'
import { useMerchantOrders } from '@/hooks/queries/useMerchantOrders'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { StockProgressBar } from '@/components/shared/StockProgressBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatCurrency, cn } from '@/lib/utils'
import type { DashboardMetrics } from '@/types'

interface LiveOrder {
  id: string
  /** real order ID — chỉ có với historical orders, dùng để link sang detail */
  orderId?: string
  customerName: string
  product: string
  qty: number
  amount: number
  time: string
  isHistorical?: boolean
}

export default function CampaignLiveDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: campaign } = useCampaign(id)
  const { data: myCampaigns } = useMyCampaigns()
  const { data: metrics, connected, error } = useSSE(id)
  const { data: allOrders } = useMerchantOrders()
  const [orderHistoryByCampaign, setOrderHistoryByCampaign] = useState<Record<string, LiveOrder[]>>({})
  const [opsHistoryByCampaign, setOpsHistoryByCampaign] = useState<Record<string, number[]>>({})
  const prevMetricsByCampaign = useRef<Record<string, DashboardMetrics | null>>({})
  // Đánh dấu đã pre-populate feed từ API để không overwrite khi allOrders refetch
  const histInitializedRef = useRef<Record<string, boolean>>({})

  const orderHistory = orderHistoryByCampaign[id] ?? []
  const opsHistory = opsHistoryByCampaign[id] ?? Array(30).fill(0)

  // Pre-populate feed với orders lịch sử từ API — chạy một lần khi data load xong
  useEffect(() => {
    if (histInitializedRef.current[id]) return
    if (!allOrders || allOrders.length === 0) return

    const campaignOrders = allOrders
      .filter(o => o.campaignId === id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50)

    if (campaignOrders.length === 0) return

    histInitializedRef.current[id] = true

    const historicalItems: LiveOrder[] = campaignOrders.map(o => ({
      id: o.id,
      orderId: o.id,
      customerName: o.customer?.fullName ?? 'Khách hàng',
      product: o.items[0]?.productName ?? 'Sản phẩm',
      qty: o.items.reduce((s, i) => s + i.quantity, 0),
      amount: o.totalAmount,
      time: new Date(o.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      isHistorical: true,
    }))

    setOrderHistoryByCampaign(prev => ({
      ...prev,
      [id]: historicalItems,
    }))
  }, [id, allOrders])

  useEffect(() => {
    if (!metrics) return
    setTimeout(() => {
      setOpsHistoryByCampaign((prev) => {
        const currentSeries = prev[id] ?? Array(30).fill(0)
        return {
          ...prev,
          [id]: [...currentSeries.slice(1), metrics.ordersPerSecond]
        }
      })

      const previousMetrics = prevMetricsByCampaign.current[id]
      if (!previousMetrics) {
        prevMetricsByCampaign.current[id] = metrics
        return
      }

      const newOrdersCount = Math.max(
        metrics.totalOrders - previousMetrics.totalOrders,
        0
      )

      if (newOrdersCount > 0) {
        const nowLabel = new Date().toLocaleTimeString('vi-VN')
        const incomingOrders: LiveOrder[] = Array.from(
          { length: Math.min(newOrdersCount, 50) },
          (_, index) => ({
            id: `sse-${performance.now()}-${index}`,
            customerName: 'Khách hàng mới',
            product: cpIds[index % cpIds.length] ?? 'Sản phẩm',
            qty: 1,
            amount: 0,
            time: nowLabel,
            isHistorical: false,
          })
        )
        setOrderHistoryByCampaign((prev) => {
          const currentOrders = prev[id] ?? []
          return {
            ...prev,
            [id]: [...incomingOrders, ...currentOrders].slice(0, 50)
          }
        })
      }

      prevMetricsByCampaign.current[id] = metrics
    }, 0)
  }, [id, metrics])

  // Product names cho SSE orders (round-robin)
  const cpIds = (campaign?.campaignProducts ?? []).map(cp => cp.product?.name ?? cp.productId)

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

      {/* Per-product stock breakdown */}
      {campaign && (campaign.campaignProducts ?? []).length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div>
              <h2 className="text-white font-semibold">Tồn kho theo sản phẩm</h2>
              <p className="text-white/40 text-xs mt-0.5">
                {(campaign.campaignProducts ?? []).length} sản phẩm trong chiến dịch
              </p>
            </div>
          </div>
          <div className="divide-y divide-white/5">
            {(campaign.campaignProducts ?? []).map((cp) => {
              const remaining = cp.remainingQuantity
              const total = cp.saleQuantity
              const pct = total > 0 ? remaining / total : 0
              const isCritical = pct < 0.1
              const isLow = pct < 0.3
              const sold = Math.max(0, total - remaining)
              return (
                <div key={cp.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-white/80 text-sm font-medium truncate">
                        {cp.product?.name ?? `Sản phẩm ${cp.productId.slice(-6)}`}
                      </p>
                      <div className="flex items-center gap-3 text-xs flex-shrink-0">
                        <span className="text-white/40">
                          Đã bán: <span className="text-indigo-300 font-semibold">{sold}</span>
                        </span>
                        <span className="text-white/40">
                          Còn:{' '}
                          <span className={`font-semibold ${
                            isCritical ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-emerald-400'
                          }`}>{remaining}</span>
                        </span>
                        <span className="text-white/25">/ {total}</span>
                      </div>
                    </div>
                    <StockProgressBar remaining={remaining} total={total} size="sm" />
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-white/60 text-xs">{formatCurrency(cp.salePrice)}</p>
                    <p className={`text-xs font-bold mt-0.5 ${
                      isCritical ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-white/40'
                    }`}>
                      {Math.round(pct * 100)}%
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Live order feed */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold flex items-center gap-2">
            Đơn hàng
            {connected && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live" /> Live
              </span>
            )}
          </h2>
          {orderHistory.length > 0 && (
            <span className="text-white/30 text-xs">{orderHistory.length} đơn</span>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
          {orderHistory.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-white/30 text-sm">Chưa có đơn hàng nào</p>
              {!connected && <p className="text-white/20 text-xs mt-1">Đang chờ kết nối SSE...</p>}
            </div>
          ) : (
            orderHistory.map((order) => {
              const rowCls = cn(
                'px-5 py-3.5 flex items-center gap-3 border-b border-white/5 last:border-0 transition-colors',
                !order.isHistorical && 'animate-order-arrive',
                order.orderId && 'hover:bg-white/5 cursor-pointer group'
              )
              const inner = (<>
                  {/* Avatar */}
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
                    order.isHistorical
                      ? 'bg-white/8 text-white/45'
                      : 'bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/25'
                  )}>
                    {order.isHistorical
                      ? order.customerName.slice(0, 1).toUpperCase()
                      : '✓'}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-sm font-medium truncate',
                        order.isHistorical ? 'text-white/75' : 'text-white/90'
                      )}>
                        {order.customerName}
                      </span>
                      {!order.isHistorical && (
                        <span className="flex-shrink-0 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">
                          VỪA CHỐT
                        </span>
                      )}
                    </div>
                    <p className="text-white/40 text-xs truncate">
                      {order.product}
                      {order.qty > 1 && <span className="ml-1 text-white/30">× {order.qty}</span>}
                    </p>
                  </div>

                  {/* Amount + time */}
                  <div className="text-right flex-shrink-0 space-y-0.5">
                    {order.amount > 0 && (
                      <p className="text-indigo-300 text-xs font-bold">
                        {formatCurrency(order.amount)}
                      </p>
                    )}
                    <p className="text-white/25 text-xs">{order.time}</p>
                  </div>

                  {/* Arrow for clickable */}
                  {order.orderId && (
                    <ExternalLink size={13} className="text-white/20 flex-shrink-0 group-hover:text-indigo-400 transition-colors" />
                  )}
                </>)

              return order.orderId ? (
                <Link key={order.id} href={`/merchant/orders/${order.orderId}`} className={rowCls}>
                  {inner}
                </Link>
              ) : (
                <div key={order.id} className={rowCls}>
                  {inner}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
