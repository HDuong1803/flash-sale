'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMerchantRevenue } from '@/hooks/queries/useMerchantRevenue'
import { PeriodFilter } from '@/components/shared/PeriodFilter'
import { formatCurrency } from '@/lib/utils'

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

const RANK_STYLE = [
  { bg: 'rgba(245,158,11,0.18)', color: '#f59e0b' },
  { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
  { bg: 'rgba(180,120,60,0.15)',  color: '#b47c3c' },
]

export function TopProductsCard() {
  const [days, setDays] = useState(30)

  const range = useMemo(() => ({
    startDate: toDateStr(new Date(Date.now() - (days - 1) * 86400000)),
    endDate: toDateStr(new Date()),
  }), [days])

  const { data, loading } = useMerchantRevenue(range)

  const products = data?.topProducts.slice(0, 5) ?? []
  const maxRevenue = products[0]?.revenue ?? 1

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <h2 className="text-white font-semibold">Sản phẩm bán chạy</h2>
          <PeriodFilter value={days} onChange={setDays} />
        </div>
        <Link href="/merchant/revenue" className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors">
          Xem báo cáo →
        </Link>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="bg-white/8 h-7 w-7 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="bg-white/8 h-3 w-2/3 rounded" />
                <div className="bg-white/8 h-1.5 w-full rounded-full" />
              </div>
              <div className="bg-white/8 h-3 w-16 rounded" />
            </div>
          ))
        ) : products.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-6">Chưa có dữ liệu sản phẩm</p>
        ) : (
          products.map((p, i) => {
            const style = RANK_STYLE[i] ?? { bg: 'rgba(99,102,241,0.12)', color: '#818cf8' }
            return (
              <div key={p.productId} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: style.bg, color: style.color }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-white/80 text-xs font-medium truncate">{p.productName}</p>
                  <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white/75 text-xs font-semibold">{formatCurrency(p.revenue)}</p>
                  <p className="text-white/30 text-xs">{p.quantity} đã bán</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
