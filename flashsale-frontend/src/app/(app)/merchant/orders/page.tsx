'use client'

import { useState } from 'react'
import { ClipboardList, AlertCircle, Download } from 'lucide-react'
import { useMerchantOrders } from '@/hooks/queries/useMerchantOrders'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { OrderRowSkeleton } from '@/components/shared/skeletons/OrderRowSkeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate, maskString } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'

const TABS: { label: string; value: OrderStatus | 'ALL' }[] = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Chờ xác nhận', value: 'PENDING' },
  { label: 'Đã xác nhận', value: 'CONFIRMED' },
  { label: 'Đang giao', value: 'SHIPPING' },
  { label: 'Hoàn thành', value: 'DONE' },
  { label: 'Đã hủy', value: 'CANCELLED' },
]

export default function MerchantOrdersPage() {
  const [activeTab, setActiveTab] = useState<OrderStatus | 'ALL'>('ALL')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const { data: orders, loading, error, refetch } = useMerchantOrders(
    activeTab !== 'ALL' ? { status: activeTab } : undefined
  )

  const exportCSV = () => {
    if (orders.length === 0) return
    const rows = [
      ['Mã đơn', 'Khách hàng', 'Sản phẩm', 'Giá trị', 'Trạng thái', 'Ngày'],
      ...orders.map((o) => [
        o.id, maskString(o.customerId), o.items[0]?.productName ?? '',
        o.totalAmount, o.status, formatDate(o.createdAt),
      ])
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'orders.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-white text-2xl font-bold">Đơn hàng nhận được</h1>
        <button onClick={exportCSV} disabled={orders.length === 0}
          className="btn-glass flex items-center gap-2 text-sm disabled:opacity-40">
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.value ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'glass text-white/60 hover:text-white hover:bg-white/10'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <OrderRowSkeleton key={i} />)}</div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
        </div>
      ) : orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Chưa có đơn hàng nào" description="Đơn hàng từ khách hàng sẽ hiển thị ở đây" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {['Mã đơn', 'Khách hàng', 'Sản phẩm', 'Giá trị', 'Trạng thái', 'Ngày', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} onClick={() => setSelectedOrder(order)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-white/50 text-xs font-mono">#{order.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-white/70 text-sm">{maskString(order.customerId.slice(0, 8))}</td>
                    <td className="px-4 py-3 text-white/70 text-sm max-w-[180px]">
                      <p className="line-clamp-1">{order.items[0]?.productName}</p>
                      {order.items.length > 1 && <p className="text-white/40 text-xs">+{order.items.length - 1} khác</p>}
                    </td>
                    <td className="px-4 py-3 text-indigo-300 font-bold text-sm">{formatCurrency(order.totalAmount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 text-white/40 text-xs">{formatDate(order.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="text-indigo-400 text-xs hover:text-indigo-300">Chi tiết →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => { if (!open) setSelectedOrder(null) }}>
        <DialogContent className="glass-strong border border-white/15 bg-[rgba(15,10,42,0.85)] backdrop-blur-2xl max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="text-white">Đơn #{selectedOrder?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-white/50 text-sm">Trạng thái</span>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <div className="border-t border-white/10 pt-4 space-y-2">
                <p className="text-white/50 text-xs font-semibold uppercase">Sản phẩm</p>
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-white/70 line-clamp-1">{item.productName} × {item.quantity}</span>
                    <span className="text-indigo-300 font-medium">{formatCurrency(item.quantity * item.unitPrice)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold border-t border-white/10 pt-2">
                  <span className="text-white">Tổng</span>
                  <span className="text-indigo-300">{formatCurrency(selectedOrder.totalAmount)}</span>
                </div>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-white/50 text-xs font-semibold uppercase mb-2">Thông tin giao hàng</p>
                <p className="text-white/70 text-sm">{maskString(selectedOrder.customerId.slice(0, 12))}</p>
                <p className="text-white/50 text-sm">{selectedOrder.shippingAddress}</p>
              </div>
              {selectedOrder.payment && (
                <div className="border-t border-white/10 pt-4">
                  <p className="text-white/50 text-xs font-semibold uppercase mb-2">Thanh toán</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Phương thức</span>
                    <span className="text-white">{selectedOrder.payment.method}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-white/50">Trạng thái</span>
                    <StatusBadge status={selectedOrder.payment.status} />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
