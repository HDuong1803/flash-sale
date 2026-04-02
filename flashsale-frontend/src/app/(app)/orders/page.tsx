'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ShoppingBag, AlertCircle } from 'lucide-react'
import { useMyOrders } from '@/hooks/queries/useMyOrders'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { OrderRowSkeleton } from '@/components/shared/skeletons/OrderRowSkeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { OrderStatus } from '@/types'

const STATUS_TABS: { label: string; value: OrderStatus | 'ALL' }[] = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Chờ xác nhận', value: 'PENDING' },
  { label: 'Đã xác nhận', value: 'CONFIRMED' },
  { label: 'Đang giao', value: 'SHIPPING' },
  { label: 'Hoàn thành', value: 'DONE' },
  { label: 'Đã hủy', value: 'CANCELLED' },
]

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<OrderStatus | 'ALL'>('ALL')
  const { data: orders, loading, error, refetch } = useMyOrders(
    activeTab !== 'ALL' ? { status: activeTab } : undefined
  )
  const totalOrders = orders.length
  const completedOrders = orders.filter((o) => o.status === 'DONE').length
  const pendingOrders = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').length
  const totalSpent = orders.reduce((sum, o) => sum + o.totalAmount, 0)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-white text-2xl font-bold">Đơn hàng của tôi</h1>

      {!loading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="glass rounded-xl p-3">
            <p className="text-white/45 text-xs">Tổng đơn</p>
            <p className="text-white font-bold text-lg">{totalOrders}</p>
          </div>
          <div className="glass rounded-xl p-3">
            <p className="text-white/45 text-xs">Đơn hoàn thành</p>
            <p className="text-emerald-300 font-bold text-lg">{completedOrders}</p>
          </div>
          <div className="glass rounded-xl p-3">
            <p className="text-white/45 text-xs">Đang xử lý</p>
            <p className="text-indigo-300 font-bold text-lg">{pendingOrders}</p>
          </div>
          <div className="glass rounded-xl p-3">
            <p className="text-white/45 text-xs">Tổng chi tiêu</p>
            <p className="text-white font-bold text-lg">{formatCurrency(totalSpent)}</p>
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.value
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'glass text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <OrderRowSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
        </div>
      ) : orders.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Chưa có đơn hàng nào" description="Các đơn hàng của bạn sẽ hiển thị ở đây" />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const firstItem = order.items[0]
            return (
              <div key={order.id} className="glass rounded-2xl p-4 hover:border-white/20 transition-all">
                <div className="flex items-center gap-4">
                  {/* Thumbnail */}
                  <div className="w-20 h-20 rounded-xl overflow-hidden glass flex-shrink-0 relative">
                    {firstItem?.imageUrl ? (
                      <Image src={firstItem.imageUrl} alt={firstItem.productName} fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ShoppingBag size={24} className="text-white/20" />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white/40 text-xs">#{order.id.slice(0, 8)}</p>
                    <p className="text-white font-medium text-sm mt-0.5 line-clamp-1">{firstItem?.productName ?? 'Sản phẩm'}</p>
                    {order.items.length > 1 && <p className="text-white/40 text-xs">+{order.items.length - 1} sản phẩm khác</p>}
                    <p className="text-white/40 text-xs mt-0.5">{formatDate(order.createdAt)}</p>
                  </div>
                  {/* Right */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <StatusBadge status={order.status} />
                    <p className="text-indigo-300 font-bold text-sm">{formatCurrency(order.totalAmount)}</p>
                    <Link href={`/orders/${order.id}`} className="btn-glass text-xs px-3 py-1.5">Chi tiết</Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
