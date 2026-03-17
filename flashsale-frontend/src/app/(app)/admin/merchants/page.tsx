'use client'

import { useState } from 'react'
import { Store, AlertCircle, Loader2 } from 'lucide-react'
import { useAdminMerchants } from '@/hooks/queries/useAdminMerchants'
import { useApproveMerchant } from '@/hooks/mutations/useApproveMerchant'
import { useRejectMerchant } from '@/hooks/mutations/useRejectMerchant'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate } from '@/lib/utils'
import type { Merchant, KycStatus } from '@/types'

const TABS: { label: string; value: KycStatus }[] = [
  { label: 'Chờ duyệt', value: 'PENDING' },
  { label: 'Đã duyệt', value: 'APPROVED' },
  { label: 'Bị từ chối', value: 'REJECTED' },
]

export default function AdminMerchantsPage() {
  const [activeTab, setActiveTab] = useState<KycStatus>('PENDING')
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState<string | null>(null)

  const { data: merchants, loading, error, refetch } = useAdminMerchants(activeTab)
  const { approve, loading: approving } = useApproveMerchant()
  const { reject, loading: rejecting } = useRejectMerchant()

  const handleApprove = async (id: string) => {
    try { await approve(id); refetch(); setSelectedMerchant(null); setConfirmApprove(null) } catch {}
  }
  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return
    try { await reject(id, rejectReason); refetch(); setSelectedMerchant(null); setShowRejectForm(false); setRejectReason('') } catch {}
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-white text-2xl font-bold">Quản lý Merchant</h1>

      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.value ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'glass text-white/60 hover:text-white hover:bg-white/10'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass rounded-2xl overflow-hidden animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-6 py-4 border-b border-white/5">
              <div className="bg-white/8 h-4 flex-1 rounded" />
              <div className="bg-white/8 h-4 w-24 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
        </div>
      ) : merchants.length === 0 ? (
        <EmptyState icon={Store} title="Không có merchant nào" description="Không có merchant nào trong danh mục này" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {['Doanh nghiệp', 'Email', 'MST', 'Đăng ký lúc', 'Trạng thái', 'Hành động'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {merchants.map((m) => (
                  <tr key={m.id} onClick={() => setSelectedMerchant(m)}
                    className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${m.kycStatus === 'PENDING' ? 'border-l-2 border-l-yellow-500/50' : ''}`}>
                    <td className="px-4 py-3 text-white font-medium text-sm">{m.businessName}</td>
                    <td className="px-4 py-3 text-white/60 text-sm">{m.email}</td>
                    <td className="px-4 py-3 text-white/50 text-xs font-mono">{m.taxCode}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">{formatDate(m.createdAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={m.kycStatus} /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {m.kycStatus === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmApprove(m.id)} className="text-xs px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all">Duyệt</button>
                          <button onClick={() => { setSelectedMerchant(m); setShowRejectForm(true) }} className="text-xs px-3 py-1.5 rounded-xl bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25 transition-all">Từ chối</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedMerchant} onOpenChange={(open) => { if (!open) { setSelectedMerchant(null); setShowRejectForm(false); setRejectReason('') } }}>
        <SheetContent className="glass-strong border-white/15 bg-transparent w-[480px]">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              {selectedMerchant?.businessName}
              {selectedMerchant && <StatusBadge status={selectedMerchant.kycStatus} />}
            </SheetTitle>
          </SheetHeader>
          {selectedMerchant && (
            <div className="mt-6 space-y-4">
              <div className="glass rounded-xl p-4 space-y-2">
                <p className="text-white/40 text-xs font-semibold uppercase">Thông tin chủ sở hữu</p>
                <div className="flex justify-between text-sm"><span className="text-white/50">Email</span><span className="text-white">{selectedMerchant.email}</span></div>
                <div className="flex justify-between text-sm"><span className="text-white/50">Đăng ký</span><span className="text-white">{formatDate(selectedMerchant.createdAt)}</span></div>
              </div>
              <div className="glass rounded-xl p-4 space-y-2">
                <p className="text-white/40 text-xs font-semibold uppercase">Thông tin doanh nghiệp</p>
                <div className="flex justify-between text-sm"><span className="text-white/50">Tên</span><span className="text-white">{selectedMerchant.businessName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-white/50">MST</span><span className="text-white font-mono">{selectedMerchant.taxCode}</span></div>
                <div className="flex justify-between text-sm items-center"><span className="text-white/50">Trạng thái KYC</span><StatusBadge status={selectedMerchant.kycStatus} /></div>
              </div>

              {selectedMerchant.kycStatus === 'PENDING' && (
                <div className="space-y-3 pt-2">
                  {!showRejectForm ? (
                    <>
                      <button onClick={() => setConfirmApprove(selectedMerchant.id)} disabled={approving} className="btn-primary w-full" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                        Duyệt Merchant
                      </button>
                      <button onClick={() => setShowRejectForm(true)} className="btn-glass w-full text-red-300 border-red-500/20">Từ chối</button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <label className="text-white/60 text-sm">Lý do từ chối *</label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="input-glass resize-none"
                        rows={3}
                        placeholder="Nhập lý do từ chối..."
                      />
                      <button onClick={() => handleReject(selectedMerchant.id)} disabled={!rejectReason.trim() || rejecting}
                        className="w-full py-3 rounded-xl bg-red-500/80 hover:bg-red-500 text-white font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {rejecting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Đang xử lý...
                          </>
                        ) : 'Xác nhận từ chối'}
                      </button>
                      <button onClick={() => setShowRejectForm(false)} className="btn-glass w-full">Hủy</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!confirmApprove}
        title="Duyệt Merchant?"
        description="Merchant sẽ được phép tạo chiến dịch Flash Sale."
        confirmLabel="Duyệt"
        cancelLabel="Hủy"
        onConfirm={() => confirmApprove && handleApprove(confirmApprove)}
        onCancel={() => setConfirmApprove(null)}
        loading={approving}
      />
    </div>
  )
}
