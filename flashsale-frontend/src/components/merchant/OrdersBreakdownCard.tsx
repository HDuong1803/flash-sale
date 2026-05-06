'use client'

import Link from 'next/link'
import { useMerchantOrders } from '@/hooks/queries/useMerchantOrders'
import type { OrderStatus } from '@/types'

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Chờ xác nhận', color: 'bg-yellow-400',  bg: 'text-yellow-400' },
  CONFIRMED: { label: 'Đã xác nhận',  color: 'bg-blue-400',    bg: 'text-blue-400' },
  SHIPPING:  { label: 'Đang giao',    color: 'bg-indigo-400',  bg: 'text-indigo-400' },
  DONE:      { label: 'Hoàn thành',   color: 'bg-emerald-400', bg: 'text-emerald-400' },
  CANCELLED: { label: 'Đã huỷ',      color: 'bg-red-400',     bg: 'text-red-400' },
}

const STATUS_ORDER: OrderStatus[] = ['PENDING', 'CONFIRMED', 'SHIPPING', 'DONE', 'CANCELLED']

export function OrdersBreakdownCard() {
  const { data: orders, loading } = useMerchantOrders()

  const breakdown = orders.reduce<Partial<Record<OrderStatus, number>>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  const total = orders.length

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <h2 className="text-white font-semibold">Trạng thái đơn hàng</h2>
          <p className="text-white/40 text-xs mt-0.5">{loading ? '...' : `Tổng ${total} đơn`}</p>
        </div>
        <Link href="/merchant/orders" className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors">
          Xem tất cả →
        </Link>
      </div>

      <div className="p-5 space-y-3.5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="flex justify-between">
                <div className="bg-white/8 h-3 w-24 rounded" />
                <div className="bg-white/8 h-3 w-8 rounded" />
              </div>
              <div className="bg-white/8 h-1.5 w-full rounded-full" />
            </div>
          ))
        ) : (
          STATUS_ORDER.map((status) => {
            const cfg = STATUS_CONFIG[status]
            const count = breakdown[status] ?? 0
            const pct = total > 0 ? (count / total) * 100 : 0
            return (
              <div key={status} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-white/55 text-xs">{cfg.label}</span>
                  <span className={`text-xs font-bold ${cfg.bg}`}>{count}</span>
                </div>
                <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${cfg.color} rounded-full transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
