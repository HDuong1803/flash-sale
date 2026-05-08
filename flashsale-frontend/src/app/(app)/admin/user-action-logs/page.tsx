'use client'

import { useState, useMemo } from 'react'
import {
  ScrollText, Search, Download, Calendar, User, Activity,
  AlertCircle, RefreshCcw, Eye, Globe, Loader2
} from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { PaginationBar } from '@/components/shared/PaginationBar'
import { AutoRefreshTimer } from '@/components/shared/AutoRefreshTimer'
import { useUserActionLogs } from '@/hooks/queries/useUserActionLogs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import type { UserActionLog } from '@/types'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  login:    { label: 'Đăng nhập',  color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/20',      icon: <User size={10} /> },
  logout:   { label: 'Đăng xuất',  color: 'bg-slate-500/20 text-slate-300 border-slate-500/20',   icon: <User size={10} /> },
  register: { label: 'Đăng ký',    color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/20', icon: <User size={10} /> },
  purchase: { label: 'Mua hàng',   color: 'bg-green-500/20 text-green-300 border-green-500/20',    icon: <Activity size={10} /> },
  checkout: { label: 'Thanh toán', color: 'bg-purple-500/20 text-purple-300 border-purple-500/20', icon: <Activity size={10} /> },
  reserve:  { label: 'Đặt chỗ',   color: 'bg-blue-500/20 text-blue-300 border-blue-500/20',       icon: <Activity size={10} /> },
}

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action] ?? { label: action, color: 'bg-white/10 text-white/60 border-white/10', icon: null }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  )
}

function formatTs(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    time: d.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    full: d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full', timeStyle: 'medium' })
  }
}

export default function AdminUserActionLogsPage() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [searchIp, setSearchIp] = useState('')
  const [selectedLog, setSelectedLog] = useState<UserActionLog | null>(null)

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    action: actionFilter || undefined,
    ip: searchIp.trim() || undefined,
    from: fromDate ? new Date(fromDate + 'T00:00:00').toISOString() : undefined,
    to:   toDate   ? new Date(toDate   + 'T23:59:59').toISOString() : undefined,
  }), [page, actionFilter, searchIp, fromDate, toDate])

  const { items, total, loading, isFetching, error, refetch } = useUserActionLogs(params)

  const handleFilterChange = (updates: Partial<typeof params>) => {
    void updates
    setPage(1)
  }

  const handleExportCSV = () => {
    const csv = [
      ['Thời gian', 'Hành động', 'Mã người dùng', 'IP', 'Mã đối tượng', 'Mã log'].join(','),
      ...items.map(log => [
        new Date(log.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        log.action,
        log.userId ?? 'Khách',
        log.ip ?? '',
        log.targetId ?? '',
        log.id,
      ].join(','))
    ].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ScrollText className="text-indigo-400" size={28} />
            Nhật ký hoạt động
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Theo dõi hành vi người dùng — đăng nhập, mua hàng, thanh toán, đặt chỗ
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !loading && <Loader2 size={16} className="text-white/30 animate-spin" />}
          <AutoRefreshTimer onRefresh={refetch} />
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(ACTION_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => {
              setActionFilter(prev => prev === key ? '' : key)
              handleFilterChange({ action: key })
            }}
            className={`glass rounded-xl p-3 text-left transition-all hover:bg-white/8 ${
              actionFilter === key ? 'ring-1 ring-indigo-500/50 bg-indigo-500/10' : ''
            }`}
          >
            <p className="text-white/40 text-xs mb-1">{cfg.label}</p>
            <ActionBadge action={key} />
          </button>
        ))}
      </div>

      {/* Filters */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={14} />
            <Input
              placeholder="Lọc theo IP..."
              value={searchIp}
              onChange={e => { setSearchIp(e.target.value); handleFilterChange({ ip: e.target.value }) }}
              className="input-glass pl-9 text-sm"
            />
          </div>
          <Select
            value={actionFilter || 'ALL'}
            onValueChange={v => { const a = v === 'ALL' ? '' : (v ?? ''); setActionFilter(a); handleFilterChange({ action: a }) }}
          >
            <SelectTrigger className="w-full sm:w-44 glass border-white/10 text-sm">
              <SelectValue>
                {actionFilter ? ACTION_CONFIG[actionFilter]?.label : 'Tất cả hành động'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              <SelectItem value="ALL">Tất cả hành động</SelectItem>
              {Object.entries(ACTION_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleExportCSV} variant="outline" className="btn-glass gap-2 text-sm" disabled={items.length === 0}>
            <Download size={14} />Xuất CSV
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Calendar size={14} className="text-white/40 flex-shrink-0" />
          <span className="text-white/50 text-sm flex-shrink-0">Từ</span>
          <Input
            type="date"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); handleFilterChange({ from: e.target.value }) }}
            className="input-glass w-36 text-sm"
          />
          <span className="text-white/30 text-sm">→</span>
          <span className="text-white/50 text-sm flex-shrink-0">Đến</span>
          <Input
            type="date"
            value={toDate}
            onChange={e => { setToDate(e.target.value); handleFilterChange({ to: e.target.value }) }}
            className="input-glass w-36 text-sm"
          />
          {(fromDate || toDate || actionFilter || searchIp) && (
            <button
              onClick={() => {
                setFromDate(''); setToDate(''); setActionFilter(''); setSearchIp(''); setPage(1)
              }}
              className="text-white/40 hover:text-white/70 text-sm transition-colors"
            >
              Xóa bộ lọc
            </button>
          )}
          <span className="ml-auto text-white/30 text-xs">{total} kết quả</span>
        </div>
      </GlassCard>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 bg-white/5" />)}
        </div>
      ) : error ? (
        <GlassCard className="p-12 text-center">
          <AlertCircle className="mx-auto mb-4 text-red-400" size={48} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <Button onClick={refetch} variant="outline" className="btn-glass gap-2">
            <RefreshCcw size={16} />Thử lại
          </Button>
        </GlassCard>
      ) : items.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <ScrollText className="mx-auto mb-4 text-white/20" size={48} />
          <p className="text-white/60">Chưa có nhật ký hoạt động nào</p>
          <p className="text-white/30 text-sm mt-2">Hệ thống sẽ tự động ghi lại khi có hoạt động từ người dùng</p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase w-36">Thời gian</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase w-28">Hành động</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Người dùng</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase w-36">Địa chỉ IP</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Đối tượng</th>
                  <th className="text-right p-4 text-xs font-semibold text-white/60 uppercase w-16">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {items.map(log => {
                  const ts = formatTs(log.createdAt)
                  return (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/4 transition-colors">
                      <td className="p-4">
                        <p className="text-white/70 text-sm">{ts.date}</p>
                        <p className="text-white/40 text-xs font-mono">{ts.time}</p>
                      </td>
                      <td className="p-4">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="p-4">
                        {log.userId ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center flex-shrink-0">
                              <User className="text-white" size={12} />
                            </div>
                            <p className="text-white/70 text-xs font-mono">{log.userId.slice(0, 12)}…</p>
                          </div>
                        ) : (
                          <span className="text-white/30 text-xs">Khách</span>
                        )}
                      </td>
                      <td className="p-4">
                        <p className="text-white/60 font-mono text-xs">{log.ip ?? '—'}</p>
                      </td>
                      <td className="p-4">
                        {log.targetId
                          ? <p className="text-white/50 font-mono text-xs">{log.targetId.slice(0, 14)}…</p>
                          : <p className="text-white/20 text-xs">—</p>
                        }
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                          aria-label="Xem chi tiết"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="p-4 border-t border-white/5">
              <PaginationBar total={total} page={page - 1} pageSize={PAGE_SIZE} onPage={p => setPage(p + 1)} />
            </div>
          )}
        </GlassCard>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={open => !open && setSelectedLog(null)}>
        <DialogContent className="glass-strong border border-white/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-base">
              <ScrollText className="text-indigo-400" size={18} />
              Chi tiết nhật ký
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-3">
                <ActionBadge action={selectedLog.action} />
                <span className="text-white/40 text-xs font-mono">{selectedLog.id.slice(0, 16)}…</span>
              </div>
              <div className="space-y-3 text-sm">
                <Row label="Thời gian" value={formatTs(selectedLog.createdAt).full} mono={false} />
                <Row label="Người dùng" value={selectedLog.userId ?? 'Khách (không xác thực)'} mono />
                <Row label="Địa chỉ IP" value={selectedLog.ip ?? 'Không có'} mono />
                {selectedLog.targetId && (
                  <Row label="Mã đối tượng" value={selectedLog.targetId} mono />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-white/40 flex-shrink-0">{label}</span>
      <span className={`text-white/80 text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}
