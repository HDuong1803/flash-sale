'use client'

import { useState } from 'react'
import { Zap, AlertCircle, Loader2 } from 'lucide-react'
import { useAdminCampaigns } from '@/hooks/queries/useAdminCampaigns'
import { useApproveCampaign } from '@/hooks/mutations/useApproveCampaign'
import { useRejectCampaign } from '@/hooks/mutations/useRejectCampaign'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatCurrency, formatDate, calculateDiscount } from '@/lib/utils'
import type { Campaign, CampaignStatus } from '@/types'

const TABS: { label: string; value: CampaignStatus }[] = [
  { label: 'Chờ duyệt', value: 'APPROVED' },
  { label: 'Đã duyệt', value: 'SCHEDULED' },
  { label: 'Đang chạy', value: 'ACTIVE' },
  { label: 'Bị từ chối', value: 'ENDED' },
]

export default function AdminCampaignsPage() {
  const [activeTab, setActiveTab] = useState<CampaignStatus>('APPROVED')
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState<string | null>(null)

  const { data: campaigns, loading, error, refetch } = useAdminCampaigns(activeTab)
  const { approve, loading: approving } = useApproveCampaign()
  const { reject, loading: rejecting } = useRejectCampaign()

  const handleApprove = async (id: string) => {
    try { await approve(id); refetch(); setSelectedCampaign(null); setConfirmApprove(null) } catch {}
  }
  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return
    try { await reject(id, rejectReason); refetch(); setSelectedCampaign(null); setShowRejectForm(false); setRejectReason('') } catch {}
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-white text-2xl font-bold">Quản lý Chiến dịch</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.value ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'glass text-white/60 hover:text-white hover:bg-white/10'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass rounded-2xl overflow-hidden animate-pulse p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-white/8 h-12 rounded-xl" />)}
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState icon={Zap} title="Không có chiến dịch nào" description="Không có chiến dịch trong danh mục này" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {['Tên chiến dịch', 'Merchant', 'SP', 'Thời gian', 'Trạng thái', 'Hành động'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} onClick={() => setSelectedCampaign(c)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-white font-medium text-sm max-w-[200px]">
                      <p className="line-clamp-1">{c.name}</p>
                    </td>
                    <td className="px-4 py-3 text-white/60 text-sm">{c.merchantName}</td>
                    <td className="px-4 py-3 text-white/60 text-sm">{c.products.length}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">
                      <p>{formatDate(c.startTime)}</p>
                      <p>→ {formatDate(c.endTime)}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {c.status === 'APPROVED' && (
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmApprove(c.id)} className="text-xs px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all">Duyệt</button>
                          <button onClick={() => { setSelectedCampaign(c); setShowRejectForm(true) }} className="text-xs px-3 py-1.5 rounded-xl bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25 transition-all">Từ chối</button>
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
      <Sheet open={!!selectedCampaign} onOpenChange={(open) => { if (!open) { setSelectedCampaign(null); setShowRejectForm(false); setRejectReason('') } }}>
        <SheetContent className="glass-strong border-white/15 bg-transparent w-[600px]">
          <SheetHeader>
            <SheetTitle className="text-white">{selectedCampaign?.name}</SheetTitle>
          </SheetHeader>
          {selectedCampaign && (
            <div className="mt-6 space-y-4 overflow-y-auto">
              <div className="glass rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-white/50">Merchant</span><span className="text-white">{selectedCampaign.merchantName}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Bắt đầu</span><span className="text-white">{formatDate(selectedCampaign.startTime)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Kết thúc</span><span className="text-white">{formatDate(selectedCampaign.endTime)}</span></div>
                {selectedCampaign.description && (
                  <div><span className="text-white/50">Mô tả</span><p className="text-white/70 mt-1 text-xs">{selectedCampaign.description}</p></div>
                )}
              </div>

              {selectedCampaign.products.length > 0 && (
                <div className="glass rounded-xl overflow-hidden">
                  <p className="px-4 py-2 text-white/40 text-xs font-semibold uppercase border-b border-white/10">Sản phẩm</p>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-white/5">
                      {['Tên SP', 'Gốc', 'Sale', 'Giảm', 'SL', 'Limit'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-white/30">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {selectedCampaign.products.map((p) => (
                        <tr key={p.id} className="border-b border-white/5">
                          <td className="px-3 py-2 text-white/70 line-clamp-1 max-w-[100px]">{p.productName}</td>
                          <td className="px-3 py-2 text-white/50 line-through">{formatCurrency(p.originalPrice)}</td>
                          <td className="px-3 py-2 text-indigo-300 font-bold">{formatCurrency(p.salePrice)}</td>
                          <td className="px-3 py-2"><span className="bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full">-{calculateDiscount(p.originalPrice, p.salePrice)}%</span></td>
                          <td className="px-3 py-2 text-white/60">{p.saleQuantity}</td>
                          <td className="px-3 py-2 text-white/60">{p.perUserLimit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedCampaign.status === 'APPROVED' && (
                <div className="space-y-3 pt-2">
                  {!showRejectForm ? (
                    <>
                      <button onClick={() => setConfirmApprove(selectedCampaign.id)} className="btn-primary w-full" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                        Duyệt chiến dịch
                      </button>
                      <button onClick={() => setShowRejectForm(true)} className="btn-glass w-full text-red-300 border-red-500/20">Từ chối</button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="input-glass resize-none" rows={3} placeholder="Lý do từ chối..." />
                      <button onClick={() => handleReject(selectedCampaign.id)} disabled={!rejectReason.trim() || rejecting}
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
        title="Duyệt chiến dịch?"
        description="Chiến dịch sẽ được lên lịch chạy theo thời gian đã cấu hình."
        confirmLabel="Duyệt"
        cancelLabel="Hủy"
        onConfirm={() => confirmApprove && handleApprove(confirmApprove)}
        onCancel={() => setConfirmApprove(null)}
        loading={approving}
      />
    </div>
  )
}
