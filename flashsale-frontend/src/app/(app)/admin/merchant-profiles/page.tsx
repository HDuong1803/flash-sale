'use client'

import { useState, useMemo } from 'react'
import { Building2, Search, Download, Eye, CheckCircle, XCircle, Clock, AlertCircle, RefreshCcw } from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AutoRefreshTimer } from '@/components/shared/AutoRefreshTimer'
import { useAdminMerchantProfiles } from '@/hooks/queries/useAdminMerchantProfiles'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AdminMerchantProfile, KycStatus } from '@/types'

// Force dynamic rendering to prevent auth-related build errors
export const dynamic = 'force-dynamic'

export default function AdminMerchantProfilesPage() {
  const [statusFilter, setStatusFilter] = useState<KycStatus | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<AdminMerchantProfile | null>(null)

  const { data: profiles, loading, error, refetch } = useAdminMerchantProfiles(
    statusFilter === 'ALL' ? undefined : statusFilter
  )

  // Filter by search query
  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) return profiles
    const query = searchQuery.toLowerCase()
    return profiles.filter(p =>
      p.businessName.toLowerCase().includes(query) ||
      p.taxCode.toLowerCase().includes(query) ||
      p.businessEmail.toLowerCase().includes(query) ||
      p.user.fullName.toLowerCase().includes(query)
    )
  }, [profiles, searchQuery])

  // Stats
  const stats = useMemo(() => {
    return {
      total: profiles.length,
      approved: profiles.filter(p => p.kycStatus === 'APPROVED').length,
      pending: profiles.filter(p => p.kycStatus === 'PENDING').length,
      rejected: profiles.filter(p => p.kycStatus === 'REJECTED').length,
    }
  }, [profiles])

  const handleExportCSV = () => {
    const csv = [
      ['ID', 'Tên doanh nghiệp', 'Mã số thuế', 'Email', 'Số điện thoại', 'Trạng thái KYC', 'Người đại diện', 'Ngày tạo'].join(','),
      ...filteredProfiles.map(p => [
        p.id,
        `"${p.businessName}"`,
        p.taxCode,
        p.businessEmail,
        p.businessPhone,
        p.kycStatus,
        `"${p.user.fullName}"`,
        new Date(p.createdAt).toLocaleString('vi-VN'),
      ].join(','))
    ].join('\n')
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `merchant-profiles-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Building2 className="text-indigo-400" size={28} />
            Hồ sơ nhà bán hàng
          </h1>
          <p className="text-white/50 text-sm mt-1">Quản lý và kiểm tra hồ sơ KYC của merchants</p>
        </div>
        <AutoRefreshTimer onRefresh={refetch} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Tổng số</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
            </div>
            <Building2 className="text-white/30" size={32} />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Đã duyệt</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.approved}</p>
            </div>
            <CheckCircle className="text-emerald-400/30" size={32} />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Chờ duyệt</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">{stats.pending}</p>
            </div>
            <Clock className="text-yellow-400/30" size={32} />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase">Từ chối</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{stats.rejected}</p>
            </div>
            <XCircle className="text-red-400/30" size={32} />
          </div>
        </GlassCard>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <Input
              placeholder="Tìm theo tên, mã số thuế, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-glass pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as KycStatus | 'ALL')}>
            <SelectTrigger className="w-full sm:w-48 glass border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
              <SelectItem value="PENDING">Chờ duyệt</SelectItem>
              <SelectItem value="APPROVED">Đã duyệt</SelectItem>
              <SelectItem value="REJECTED">Từ chối</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExportCSV} variant="outline" className="btn-glass gap-2" disabled={filteredProfiles.length === 0}>
            <Download size={16} />
            Xuất CSV
          </Button>
        </div>
      </GlassCard>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 bg-white/5" />)}
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
      ) : filteredProfiles.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Building2 className="mx-auto mb-4 text-white/20" size={48} />
          <p className="text-white/60">Không tìm thấy hồ sơ merchant nào</p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Doanh nghiệp</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Mã số thuế</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Liên hệ</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Người đại diện</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Trạng thái</th>
                  <th className="text-left p-4 text-xs font-semibold text-white/60 uppercase">Ngày tạo</th>
                  <th className="text-right p-4 text-xs font-semibold text-white/60 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => (
                  <tr key={profile.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                          <Building2 className="text-white" size={20} />
                        </div>
                        <div>
                          <p className="text-white font-medium">{profile.businessName}</p>
                          <p className="text-white/50 text-xs">{profile.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-white/80 font-mono text-sm">{profile.taxCode}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-white/80 text-sm">{profile.businessEmail}</p>
                      <p className="text-white/50 text-xs">{profile.businessPhone}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-white/80 text-sm">{profile.user.fullName}</p>
                      <p className="text-white/50 text-xs">{profile.user.email}</p>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={profile.kycStatus} />
                    </td>
                    <td className="p-4">
                      <p className="text-white/70 text-sm">{new Date(profile.createdAt).toLocaleDateString('vi-VN')}</p>
                      <p className="text-white/40 text-xs">{new Date(profile.createdAt).toLocaleTimeString('vi-VN')}</p>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        onClick={() => setSelectedProfile(profile)}
                        variant="ghost"
                        size="sm"
                        className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                      >
                        <Eye size={16} className="mr-2" />
                        Chi tiết
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
      <Dialog open={!!selectedProfile} onOpenChange={(open) => !open && setSelectedProfile(null)}>
        <DialogContent className="glass-strong border border-white/20 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-3">
              <Building2 className="text-indigo-400" size={24} />
              Chi tiết hồ sơ merchant
            </DialogTitle>
          </DialogHeader>
          {selectedProfile && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Trạng thái KYC</p>
                  <StatusBadge status={selectedProfile.kycStatus} />
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Trạng thái tài khoản</p>
                  <StatusBadge status={selectedProfile.user.status} />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Tên doanh nghiệp</p>
                  <p className="text-white font-medium">{selectedProfile.businessName}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Mã số thuế</p>
                  <p className="text-white/90 font-mono">{selectedProfile.taxCode}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase mb-1">Địa chỉ kinh doanh</p>
                  <p className="text-white/90">{selectedProfile.businessAddress}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-white/50 text-xs uppercase mb-1">Email kinh doanh</p>
                    <p className="text-white/90 text-sm">{selectedProfile.businessEmail}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs uppercase mb-1">Số điện thoại</p>
                    <p className="text-white/90 text-sm">{selectedProfile.businessPhone}</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 space-y-3">
                <h4 className="text-white/80 font-medium">Thông tin người đại diện</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-white/50 text-xs uppercase mb-1">Họ tên</p>
                    <p className="text-white/90">{selectedProfile.user.fullName}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs uppercase mb-1">Email</p>
                    <p className="text-white/90 text-sm">{selectedProfile.user.email}</p>
                  </div>
                </div>
              </div>

              {selectedProfile.kycStatus === 'REJECTED' && selectedProfile.rejectionReason && (
                <div className="glass-brand rounded-xl p-4">
                  <p className="text-red-400 text-xs uppercase font-semibold mb-2">Lý do từ chối</p>
                  <p className="text-white/90">{selectedProfile.rejectionReason}</p>
                </div>
              )}

              <div className="pt-4 border-t border-white/10">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-white/50 text-xs uppercase mb-1">Ngày tạo</p>
                    <p className="text-white/80">{new Date(selectedProfile.createdAt).toLocaleString('vi-VN')}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs uppercase mb-1">Cập nhật lần cuối</p>
                    <p className="text-white/80">{new Date(selectedProfile.updatedAt).toLocaleString('vi-VN')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
