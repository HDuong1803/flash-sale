'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useMyCampaigns } from '@/hooks/queries/useMyCampaigns'

const LOW_STOCK_THRESHOLD = 0.3
const CRITICAL_THRESHOLD = 0.1

export function StockAlertsCard() {
  const { data: campaigns, loading } = useMyCampaigns()

  const lowStockItems = campaigns
    .filter(c => c.status === 'ACTIVE')
    .flatMap(c =>
      (c.campaignProducts ?? [])
        .filter(cp => cp.saleQuantity > 0 && cp.remainingQuantity / cp.saleQuantity < LOW_STOCK_THRESHOLD)
        .map(cp => ({
          campaignId: c.id,
          campaignName: c.name,
          productName: cp.product?.name ?? `Sản phẩm ${cp.productId.slice(-6)}`,
          remaining: cp.remainingQuantity,
          total: cp.saleQuantity,
          pct: cp.remainingQuantity / cp.saleQuantity,
        }))
    )
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 6)

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <h2 className="text-white font-semibold">Cảnh báo tồn kho</h2>
          {!loading && lowStockItems.length > 0 && (
            <span className="bg-red-500/20 text-red-400 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
              {lowStockItems.length}
            </span>
          )}
        </div>
        <Link href="/merchant/campaigns" className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors">
          Quản lý →
        </Link>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="bg-white/8 h-5 w-5 rounded flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="bg-white/8 h-3 w-3/4 rounded" />
                <div className="bg-white/8 h-1.5 w-full rounded-full" />
              </div>
              <div className="bg-white/8 h-3 w-12 rounded" />
            </div>
          ))}
        </div>
      ) : lowStockItems.length === 0 ? (
        <div className="p-6 text-center">
          <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
            <CheckCircle2 size={20} className="text-emerald-400" />
          </div>
          <p className="text-white/50 text-sm">Tất cả sản phẩm còn đủ hàng</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {lowStockItems.map((item, i) => {
            const isCritical = item.pct < CRITICAL_THRESHOLD
            return (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <AlertTriangle
                  size={15}
                  className={`flex-shrink-0 ${isCritical ? 'text-red-400' : 'text-yellow-400'}`}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-white/80 text-xs font-medium truncate">{item.productName}</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 bg-white/8 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isCritical ? 'bg-red-500' : 'bg-yellow-500'}`}
                        style={{ width: `${item.pct * 100}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold flex-shrink-0 ${isCritical ? 'text-red-400' : 'text-yellow-400'}`}>
                      {item.remaining}/{item.total}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/merchant/campaigns/${item.campaignId}/dashboard`}
                  className="text-indigo-400/60 text-xs hover:text-indigo-300 transition-colors flex-shrink-0"
                >
                  Xem →
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
