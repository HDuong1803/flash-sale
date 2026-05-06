'use client'

import { useState, useMemo } from 'react'
import { ScrollText, Search, Download, Calendar, User, Activity, AlertCircle, RefreshCcw, Eye } from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { AutoRefreshTimer } from '@/components/shared/AutoRefreshTimer'
import { useUserActionLogs } from '@/hooks/queries/useUserActionLogs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import type { UserActionLog } from '@/types'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  reserve: { label: 'Đặt chỗ', color: 'bg-blue-500/20 text-blue-300' },
  checkout: { label: 'Thanh toán', color: 'bg-purple-500/20 text-purple-300' },
  purchase: { label: 'Mua hàng', color: 'bg-green-500/20 text-green-300' },
  login: { label: 'Đăng nhập', color: 'bg-cyan-500/20 text-cyan-300' },
  logout: { label: 'Đăng xuất', color: 'bg-gray-500/20 text-gray-300' },
  register: { label: 'Đăng ký', color: 'bg-indigo-500/20 text-indigo-300' },
}

export default function AdminUserActionLogsPage() {
  const [actionFilter, setActionFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLog, setSelectedLog] = useState<UserActionLog | null>(null)
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const dateParams = useMemo(() => {
    const p: { from?: string; to?: string } = {}
    if (fromDate) p.from = new Date(fromDate + 'T00:00:00').toISOString()
    if (toDate) p.to = new Date(toDate + 'T23:59:59').toISOString()
    return Object.keys(p).length > 0 ? p : undefined
  }, [fromDate, toDate])

  const { data: logs, loading, error, refetch } = useUserActionLogs(dateParams)

  // Filter logs
  const filteredLogs = useMemo(() => {
    let result = logs
    
    if (actionFilter !== 'ALL') {
      result = result.filter(log => log.action === actionFilter)
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(log =>
        log.action.toLowerCase().includes(query) ||
        log.id.toLowerCase().includes(query) ||
        log.userId?.toLowerCase().includes(query) ||
        log.ip?.includes(query) ||
        log.targetId?.toLowerCase().includes(query)
      )
    }
    
    return result
  }, [logs, actionFilter, searchQuery])

  // Stats
  const stats = useMemo(() => {
    const actionCounts: Record<string, number> = {}
    logs.forEach(log => {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1
    })
    
    return {
      total: logs.length,
      uniqueIPs: new Set(logs.filter(l => l.ip).map(l => l.ip)).size,
      uniqueUsers: new Set(logs.filter(l => l.userId).map(l => l.userId)).size,
      topAction: Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Chưa có',
    }
  }, [logs])

  const handleExportCSV = () => {
    const csv = [
      ['Thời gian', 'Hành động', 'Mã người dùng', 'IP', 'Mã đối tượng', 'Mã log'].join(','),
      ...filteredLogs.map(log => [
        new Date(log.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        log.action,
        log.userId || 'Khách',
        log.ip || 'Không có',
        log.targetId || 'Không có',
        log.id,
      ].join(','))
    ].join('\n')
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `user-action-logs-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const getActionBadge = (action: string) => {
    const config = ACTION_LABELS[action] || { label: action, color: 'bg-white/10 text-white/70' }
    return (
      <Badge className={`${config.color} border-0 font-medium`}>
        {config.label}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ScrollText className="text-indigo-400" size={28} />
            Nhật ký thao tác người dùng
          </h1>
          <p className="text-white/50 text-sm mt-1">Theo dõi hoạt động và hành vi người dùng trên hệ thống</p>
        </div>
        <AutoRefreshTimer onRefresh={refetch} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Tổng số nhật ký</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
            </div>
            <ScrollText className="text-white/30" size={32} />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">IP duy nhất</p>
              <p className="text-2xl font-bold text-cyan-400 mt-1">{stats.uniqueIPs}</p>
            </div>
            <Activity className="text-cyan-400/30" size={32} />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Người dùng hoạt động</p>
              <p className="text-2xl font-bold text-purple-400 mt-1">{stats.uniqueUsers}</p>
            </div>
            <User className="text-purple-400/30" size={32} />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Hành động phổ biến</p>
              <p className="text-base font-bold text-indigo-400 mt-1">{ACTION_LABELS[stats.topAction]?.label || stats.topAction}</p>
            </div>
            <Calendar className="text-indigo-400/30" size={32} />
          </div>
        </GlassCard>
      </div>

      {/* Filters */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <Input
              placeholder="Tìm theo hành động, mã người dùng, IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-glass pl-10"
            />
          </div>
          <Select value={actionFilter} onValueChange={(v) => v && setActionFilter(v)}>
            <SelectTrigger className="w-full sm:w-48 glass border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              <SelectItem value="ALL">Tất cả hành động</SelectItem>
              {Object.entries(ACTION_LABELS).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleExportCSV} variant="outline" className="btn-glass gap-2" disabled={filteredLogs.length === 0}>
            <Download size={16} />
            Xuất CSV
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex items-center gap-2 text-white/50 text-sm flex-shrink-0">
            <Calendar size={14} />
            <span>Từ ngày:</span>
          </div>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="input-glass w-full sm:w-40"
          />
          <span className="text-white/40 text-sm hidden sm:block">→</span>
          <div className="flex items-center gap-2 text-white/50 text-sm flex-shrink-0">
            <span>Đến ngày:</span>
          </div>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="input-glass w-full sm:w-40"
          />
          {(fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white/50 hover:text-white"
              onClick={() => { setFromDate(''); setToDate('') }}
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </GlassCard>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-14 bg-white/5" />)}
        </div>
      ) : error ? (
        <GlassCard className="p-12 text-center">
          <AlertCircle className="mx-auto mb-4 text-red-400" size={48} />
          <p className="text-white/80 font-medium mb-2">Không thể tải dữ liệu</p>
          <p className="text-white/50 text-sm mb-4">{error}</p>
          <Button onClick={refetch} variant="outline" className="btn-glass gap-2">
            <RefreshCcw size={16} />
            Thử lại
          </Button>
        </GlassCard>
      ) : filteredLogs.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <ScrollText className="mx-auto mb-4 text-white/20" size={48} />
          <p className="text-white/60">Không tìm thấy nhật ký nào</p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Thời gian</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Hành động</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Người dùng</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Địa chỉ IP</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Đối tượng</th>
                  <th className="text-right p-4 text-xs font-semibold text-white/60 uppercase">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <p className="text-white/80 text-sm">{new Date(log.createdAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
                      <p className="text-white/50 text-xs">{new Date(log.createdAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
                    </td>
                    <td className="p-4">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="p-4">
                      {log.userId ? (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <User className="text-white" size={14} />
                          </div>
                          <p className="text-white/80 text-sm font-mono">{log.userId.slice(0, 8)}</p>
                        </div>
                      ) : (
                        <Badge className="bg-white/5 text-white/40 border-0">Khách</Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <p className="text-white/70 font-mono text-sm">{log.ip || 'Không có'}</p>
                    </td>
                    <td className="p-4">
                      {log.targetId ? (
                        <p className="text-white/70 font-mono text-sm">{log.targetId.slice(0, 12)}...</p>
                      ) : (
                        <p className="text-white/30 text-sm">—</p>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        onClick={() => setSelectedLog(log)}
                        variant="ghost"
                        size="sm"
                        className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                      >
                        <Eye size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="glass-strong border border-white/20 max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-3">
              <ScrollText className="text-indigo-400" size={24} />
              Chi tiết nhật ký
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Mã nhật ký</p>
                  <p className="text-white/90 font-mono text-sm">{selectedLog.id}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Hành động</p>
                  {getActionBadge(selectedLog.action)}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Mã người dùng</p>
                  <p className="text-white/90 font-mono text-sm">{selectedLog.userId || 'Khách'}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Địa chỉ IP</p>
                  <p className="text-white/90 font-mono text-sm">{selectedLog.ip || 'Không có'}</p>
                </div>
              </div>

              {selectedLog.targetId && (
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Mã đối tượng</p>
                  <p className="text-white/90 font-mono text-sm break-all">{selectedLog.targetId}</p>
                </div>
              )}

              <div>
                <p className="text-white/50 text-xs uppercase mb-1">Thời gian</p>
                <p className="text-white/90">{new Date(selectedLog.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh',  
                  dateStyle: 'full', 
                  timeStyle: 'medium' 
                })}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
