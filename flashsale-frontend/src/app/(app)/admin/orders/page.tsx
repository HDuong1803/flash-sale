'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ShoppingBag, Search, AlertCircle, RefreshCcw, Eye } from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PaginationBar } from '@/components/shared/PaginationBar'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/lib/api-client'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { AdminOrder, OrderStatus } from '@/types'

const PAGE_SIZE = 20

const STATUS_OPTIONS: { label: string; value: OrderStatus | 'ALL' }[] = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Chờ xác nhận', value: 'PENDING' },
  { label: 'Đã xác nhận', value: 'CONFIRMED' },
  { label: 'Đang giao', value: 'SHIPPING' },
  { label: 'Hoàn thành', value: 'DONE' },
  { label: 'Đã huỷ', value: 'CANCELLED' },
]

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL')
  const [items, setItems] = useState<AdminOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: number, s: string, st: OrderStatus | 'ALL') => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminService.getOrders({
        page: p,
        limit: PAGE_SIZE,
        status: st !== 'ALL' ? st : undefined,
        search: s.trim() || undefined,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách đơn hàng')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page, search, status) }, [load, page, search, status])

  const handleSearch = (q: string) => { setSearch(q); setPage(1) }
  const handleStatus = (v: string) => { setStatus(v as OrderStatus | 'ALL'); setPage(1) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ShoppingBag className="text-indigo-400" size={28} />
            Quản lý đơn hàng
          </h1>
          <p className="text-white/50 text-sm mt-1">
            {total > 0 ? `${total} đơn hàng` : 'Tất cả đơn hàng trong hệ thống'}
          </p>
        </div>
        <Button onClick={() => load(page, search, status)} variant="outline" className="btn-glass gap-2" disabled={loading}>
          <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </Button>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <Input
              placeholder="Tìm theo mã đơn, tên khách hàng..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="input-glass pl-10"
            />
          </div>
          <Select value={status} onValueChange={(v) => v && handleStatus(v)}>
            <SelectTrigger className="w-full sm:w-48 glass border-white/10">
              <SelectValue>{STATUS_OPTIONS.find(o => o.value === status)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              {STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 bg-white/5" />)}
        </div>
      ) : error ? (
        <GlassCard className="p-12 text-center">
          <AlertCircle className="mx-auto mb-4 text-red-400" size={48} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <Button onClick={() => load(page, search, status)} variant="outline" className="btn-glass gap-2">
            <RefreshCcw size={16} />Thử lại
          </Button>
        </GlassCard>
      ) : items.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <ShoppingBag className="mx-auto mb-4 text-white/20" size={48} />
          <p className="text-white/60">Không có đơn hàng nào</p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Mã đơn</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Khách hàng</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Nhà bán hàng</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Sản phẩm</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Tổng tiền</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Trạng thái</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Ngày tạo</th>
                  <th className="text-right p-4 text-xs font-semibold text-white/60 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map(order => (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <p className="text-white font-mono text-sm">#{order.id.slice(-8).toUpperCase()}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-white/80 text-sm">{order.customer.fullName}</p>
                      <p className="text-white/40 text-xs">{order.customer.email}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-white/80 text-sm">{order.merchant.businessName}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-white/60 text-sm">{order._count.items} sản phẩm</p>
                    </td>
                    <td className="p-4">
                      <p className="text-white font-medium text-sm">{formatCurrency(order.totalAmount)}</p>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="p-4">
                      <p className="text-white/70 text-sm">{formatDate(order.createdAt)}</p>
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/orders/${order.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors text-sm"
                      >
                        <Eye size={14} />Xem
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-white/5">
            <PaginationBar
              total={total}
              page={page - 1}
              pageSize={PAGE_SIZE}
              onPage={p => setPage(p + 1)}
            />
          </div>
        </GlassCard>
      )}
    </div>
  )
}
