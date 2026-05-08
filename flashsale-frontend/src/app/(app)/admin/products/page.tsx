'use client'

import { useState, useEffect, useCallback } from 'react'
import { Package, Search, AlertCircle, RefreshCcw } from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PaginationBar } from '@/components/shared/PaginationBar'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/lib/api-client'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { AdminProduct } from '@/types'

const PAGE_SIZE = 20

export default function AdminProductsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<AdminProduct[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: number, s: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminService.getProducts({
        page: p,
        limit: PAGE_SIZE,
        search: s.trim() || undefined,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách sản phẩm')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page, search) }, [load, page, search])

  const handleSearch = (q: string) => { setSearch(q); setPage(1) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Package className="text-indigo-400" size={28} />
            Quản lý sản phẩm
          </h1>
          <p className="text-white/50 text-sm mt-1">
            {total > 0 ? `${total} sản phẩm` : 'Tất cả sản phẩm trong hệ thống'}
          </p>
        </div>
        <Button onClick={() => load(page, search)} variant="outline" className="btn-glass gap-2" disabled={loading}>
          <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </Button>
      </div>

      <GlassCard className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
          <Input
            placeholder="Tìm theo tên sản phẩm, nhà bán hàng..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="input-glass pl-10"
          />
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
          <Button onClick={() => load(page, search)} variant="outline" className="btn-glass gap-2">
            <RefreshCcw size={16} />Thử lại
          </Button>
        </GlassCard>
      ) : items.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Package className="mx-auto mb-4 text-white/20" size={48} />
          <p className="text-white/60">Không có sản phẩm nào</p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Sản phẩm</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Nhà bán hàng</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Danh mục</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Giá gốc</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Trạng thái</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {items.map(product => (
                  <tr key={product.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <p className="text-white font-medium text-sm">{product.name}</p>
                      <p className="text-white/40 text-xs font-mono">{product.id.slice(0, 8)}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-white/80 text-sm">{product.merchant.businessName}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-white/60 text-sm">{product.category ?? '—'}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-white font-medium text-sm">{formatCurrency(product.originalPrice)}</p>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="p-4">
                      <p className="text-white/70 text-sm">{formatDate(product.createdAt)}</p>
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
