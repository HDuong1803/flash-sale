'use client'

import { useState, useMemo } from 'react'
import { Radio, Search, Download, Code2, CheckCircle, Clock, AlertCircle, RefreshCcw, Eye } from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { AutoRefreshTimer } from '@/components/shared/AutoRefreshTimer'
import { useOutboxEvents } from '@/hooks/queries/useOutboxEvents'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { OutboxEvent } from '@/types'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const EVENT_TYPES: Record<string, { label: string; color: string }> = {
  'order.created': { label: 'Đơn hàng mới', color: 'bg-green-500/20 text-green-300' },
  'payment.succeeded': { label: 'Thanh toán thành công', color: 'bg-blue-500/20 text-blue-300' },
  'payment.failed': { label: 'Thanh toán thất bại', color: 'bg-red-500/20 text-red-300' },
  'reservation.expired': { label: 'Hết hạn đặt chỗ', color: 'bg-yellow-500/20 text-yellow-300' },
  'campaign.started': { label: 'Chiến dịch bắt đầu', color: 'bg-purple-500/20 text-purple-300' },
  'campaign.ended': { label: 'Chiến dịch kết thúc', color: 'bg-gray-500/20 text-gray-300' },
}

export default function AdminOutboxEventsPage() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PROCESSED' | 'PENDING'>('ALL')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<OutboxEvent | null>(null)

  const { data: events, loading, error, refetch } = useOutboxEvents()

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = events
    
    if (statusFilter === 'PROCESSED') {
      result = result.filter(e => e.processed)
    } else if (statusFilter === 'PENDING') {
      result = result.filter(e => !e.processed)
    }
    
    if (typeFilter !== 'ALL') {
      result = result.filter(e => e.type === typeFilter)
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(e =>
        e.type.toLowerCase().includes(query) ||
        e.aggregateId.toLowerCase().includes(query) ||
        e.id.toLowerCase().includes(query)
      )
    }
    
    return result
  }, [events, statusFilter, typeFilter, searchQuery])

  // Stats
  const stats = useMemo(() => {
    const typeCounts: Record<string, number> = {}
    events.forEach(e => {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1
    })
    
    return {
      total: events.length,
      processed: events.filter(e => e.processed).length,
      pending: events.filter(e => !e.processed).length,
      types: Object.keys(typeCounts).length,
    }
  }, [events])

  const handleExportCSV = () => {
    const csv = [
      ['Thời gian', 'Event Type', 'Aggregate ID', 'Processed', 'Processed At', 'Event ID'].join(','),
      ...filteredEvents.map(e => [
        new Date(e.createdAt).toLocaleString('vi-VN'),
        e.type,
        e.aggregateId,
        e.processed ? 'Yes' : 'No',
        e.processedAt ? new Date(e.processedAt).toLocaleString('vi-VN') : 'N/A',
        e.id,
      ].join(','))
    ].join('\n')
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `outbox-events-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const getEventTypeBadge = (type: string) => {
    const config = EVENT_TYPES[type] || { label: type, color: 'bg-white/10 text-white/70' }
    return (
      <Badge className={`${config.color} border-0 font-medium text-xs`}>
        {config.label}
      </Badge>
    )
  }

  const getStatusBadge = (processed: boolean) => {
    return processed ? (
      <Badge className="bg-emerald-500/20 text-emerald-300 border-0">
        <CheckCircle size={12} className="mr-1" />
        Đã xử lý
      </Badge>
    ) : (
      <Badge className="bg-yellow-500/20 text-yellow-300 border-0">
        <Clock size={12} className="mr-1" />
        Chờ xử lý
      </Badge>
    )
  }

  // Get unique event types from data
  const uniqueTypes = useMemo(() => {
    return Array.from(new Set(events.map(e => e.type)))
  }, [events])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Radio className="text-indigo-400" size={28} />
            Sự kiện Outbox
          </h1>
          <p className="text-white/50 text-sm mt-1">Theo dõi message queue và event processing</p>
        </div>
        <AutoRefreshTimer onRefresh={refetch} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Tổng events</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
            </div>
            <Radio className="text-white/30" size={32} />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Đã xử lý</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.processed}</p>
            </div>
            <CheckCircle className="text-emerald-400/30" size={32} />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Chờ xử lý</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">{stats.pending}</p>
            </div>
            <Clock className="text-yellow-400/30" size={32} />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Loại events</p>
              <p className="text-2xl font-bold text-purple-400 mt-1">{stats.types}</p>
            </div>
            <Code2 className="text-purple-400/30" size={32} />
          </div>
        </GlassCard>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <Input
              placeholder="Tìm theo type, aggregate ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-glass pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-full sm:w-40 glass border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              <SelectItem value="ALL">Tất cả</SelectItem>
              <SelectItem value="PENDING">Chờ xử lý</SelectItem>
              <SelectItem value="PROCESSED">Đã xử lý</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
            <SelectTrigger className="w-full sm:w-52 glass border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              <SelectItem value="ALL">Tất cả event types</SelectItem>
              {uniqueTypes.map(type => (
                <SelectItem key={type} value={type}>{EVENT_TYPES[type]?.label || type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleExportCSV} variant="outline" className="btn-glass gap-2" disabled={filteredEvents.length === 0}>
            <Download size={16} />
            Xuất CSV
          </Button>
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
      ) : filteredEvents.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Radio className="mx-auto mb-4 text-white/20" size={48} />
          <p className="text-white/60">Không tìm thấy event nào</p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Thời gian</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Event Type</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Aggregate ID</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Trạng thái</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Xử lý lúc</th>
                  <th className="text-right p-4 text-xs font-semibold text-white/60 uppercase">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <tr key={event.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <p className="text-white/80 text-sm">{new Date(event.createdAt).toLocaleDateString('vi-VN')}</p>
                      <p className="text-white/50 text-xs">{new Date(event.createdAt).toLocaleTimeString('vi-VN')}</p>
                    </td>
                    <td className="p-4">
                      {getEventTypeBadge(event.type)}
                    </td>
                    <td className="p-4">
                      <p className="text-white/80 font-mono text-sm">{event.aggregateId.slice(0, 12)}...</p>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(event.processed)}
                    </td>
                    <td className="p-4">
                      {event.processedAt ? (
                        <>
                          <p className="text-white/70 text-sm">{new Date(event.processedAt).toLocaleDateString('vi-VN')}</p>
                          <p className="text-white/40 text-xs">{new Date(event.processedAt).toLocaleTimeString('vi-VN')}</p>
                        </>
                      ) : (
                        <p className="text-white/30 text-sm">—</p>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        onClick={() => setSelectedEvent(event)}
                        variant="ghost"
                        size="sm"
                        className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                      >
                        <Eye size={16} className="mr-2" />
                        Xem
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
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="glass-strong border border-white/20 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-3">
              <Radio className="text-indigo-400" size={24} />
              Chi tiết Outbox Event
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Trạng thái</p>
                  {getStatusBadge(selectedEvent.processed)}
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Event Type</p>
                  {getEventTypeBadge(selectedEvent.type)}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Event ID</p>
                  <p className="text-white/90 font-mono text-sm break-all">{selectedEvent.id}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Aggregate ID</p>
                  <p className="text-white/90 font-mono text-sm break-all">{selectedEvent.aggregateId}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Event Type (Raw)</p>
                  <p className="text-white/90 font-mono text-sm">{selectedEvent.type}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-white/50 text-xs uppercase mb-2">Payload (JSON)</p>
                <ScrollArea className="h-64 glass rounded-lg p-3">
                  <pre className="text-xs text-white/80 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedEvent.payload, null, 2)}
                  </pre>
                </ScrollArea>
              </div>

              <div className="pt-4 border-t border-white/10">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-white/50 text-xs uppercase mb-1">Thời gian tạo</p>
                    <p className="text-white/80">{new Date(selectedEvent.createdAt).toLocaleString('vi-VN')}</p>
                  </div>
                  {selectedEvent.processedAt && (
                    <div>
                      <p className="text-white/50 text-xs uppercase mb-1">Thời gian xử lý</p>
                      <p className="text-white/80">{new Date(selectedEvent.processedAt).toLocaleString('vi-VN')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
