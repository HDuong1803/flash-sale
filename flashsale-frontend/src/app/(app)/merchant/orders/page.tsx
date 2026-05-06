'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList, AlertCircle, Download } from 'lucide-react'
import { useMerchantOrders } from '@/hooks/queries/useMerchantOrders'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { OrderRowSkeleton } from '@/components/shared/skeletons/OrderRowSkeleton'
import { PaginationBar } from '@/components/shared/PaginationBar'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { OrderStatus } from '@/types'

const PAGE_SIZE = 15

const TABS: { label: string; value: OrderStatus | 'ALL' }[] = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Chờ xác nhận', value: 'PENDING' },
  { label: 'Đã xác nhận', value: 'CONFIRMED' },
  { label: 'Đang giao', value: 'SHIPPING' },
  { label: 'Hoàn thành', value: 'DONE' },
  { label: 'Đã hủy', value: 'CANCELLED' },
]

export default function MerchantOrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = Number(searchParams.get('page') ?? '0')
  const [activeTab, setActiveTab] = useState<OrderStatus | 'ALL'>('ALL')
  const { data: allOrders, loading, error, refetch } = useMerchantOrders(
    activeTab !== 'ALL' ? { status: activeTab } : undefined
  )

  const orders = useMemo(() => {
    const start = page * PAGE_SIZE
    return allOrders.slice(start, start + PAGE_SIZE)
  }, [allOrders, page])

  const setPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const handleTabChange = (tab: OrderStatus | 'ALL') => {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const exportCSV = () => {
    if (orders.length === 0) return
    const rows = [
      ['Mã đơn', 'Khách hàng', 'Sản phẩm', 'Giá trị', 'Trạng thái', 'Ngày'],
      ...orders.map((o) => [
        o.id, o.customer?.fullName ?? o.customerId, o.items[0]?.productName ?? '',
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
          <button key={tab.value} onClick={() => handleTabChange(tab.value)}
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
      ) : allOrders.length === 0 ? (
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
                  <tr key={order.id} onClick={() => router.push(`/merchant/orders/${order.id}`)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-white/50 text-xs font-mono">#{order.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-white/70 text-sm">{order.customer?.fullName ?? '—'}</td>
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

      {!loading && !error && (
        <PaginationBar total={allOrders.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </div>
  )
}
