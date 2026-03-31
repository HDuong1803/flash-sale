'use client'

import { useState } from 'react'
import { Zap, AlertCircle, Loader2, X, Calendar, Package } from 'lucide-react'
import { useAdminCampaigns } from '@/hooks/queries/useAdminCampaigns'
import { useApproveCampaign } from '@/hooks/mutations/useApproveCampaign'
import { useRejectCampaign } from '@/hooks/mutations/useRejectCampaign'
import { useForceStartCampaign } from '@/hooks/mutations/useForceStartCampaign'
import { useForceStopCampaign } from '@/hooks/mutations/useForceStopCampaign'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { formatCurrency, formatDate, calculateDiscount } from '@/lib/utils'
import type { Campaign, CampaignStatus } from '@/types'

const TABS: { label: string; value: CampaignStatus }[] = [
  { label: 'Chờ duyệt', value: 'APPROVED' },
  { label: 'Đã duyệt', value: 'SCHEDULED' },
  { label: 'Đang chạy', value: 'ACTIVE' },
  { label: 'Đã kết thúc', value: 'ENDED' },
]

export default function AdminCampaignsPage() {
  const [activeTab, setActiveTab] = useState<CampaignStatus>('APPROVED')
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState<string | null>(null)
  const [confirmForceStart, setConfirmForceStart] = useState<string | null>(null)
  const [confirmForceStop, setConfirmForceStop] = useState<string | null>(null)

  const { data: campaigns, loading, error, refetch } = useAdminCampaigns(activeTab)
  const { approve, loading: approving } = useApproveCampaign()
  const { reject, loading: rejecting } = useRejectCampaign()
  const { forceStart, loading: forceStarting } = useForceStartCampaign()
  const { forceStop, loading: forceStoping } = useForceStopCampaign()

  const closeDetail = () => {
    setSelectedCampaign(null)
    setShowRejectForm(false)
    setRejectReason('')
  }

  const handleApprove = async (id: string) => {
    try { await approve(id); refetch(); closeDetail(); setConfirmApprove(null) } catch {}
  }

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return
    try { await reject(id, rejectReason); refetch(); closeDetail() } catch {}
  }

  const handleForceStart = async (id: string) => {
    try { await forceStart(id); refetch(); closeDetail(); setConfirmForceStart(null) } catch {}
  }

  const handleForceStop = async (id: string) => {
    try { await forceStop(id); refetch(); closeDetail(); setConfirmForceStop(null) } catch {}
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
                  {['Tên chiến dịch', 'Nhà bán hàng', 'SP', 'Thời gian', 'Trạng thái', 'Hành động'].map((h) => (
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
                    <td className="px-4 py-3 text-white/60 text-sm">{c.merchant?.businessName}</td>
                    <td className="px-4 py-3 text-white/60 text-sm">{c.campaignProducts?.length ?? 0}</td>
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

      {/* Campaign detail modal */}
      <Dialog open={!!selectedCampaign} onOpenChange={(open) => { if (!open) closeDetail() }}>
        <DialogContent className="glass-strong border-white/15 bg-slate-900/95 max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-0">
          {selectedCampaign && (
            <>
              {/* Modal header */}
              <div className="flex items-start justify-between p-6 border-b border-white/10">
                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-bold text-lg line-clamp-2">{selectedCampaign.name}</h2>
                  <div className="mt-1">
                    <StatusBadge status={selectedCampaign.status} />
                  </div>
                </div>
                <button onClick={closeDetail} className="ml-4 p-2 text-white/40 hover:text-white hover:bg-white/8 rounded-lg transition-all shrink-0">
                  <X size={16} />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-6 space-y-4">
                {/* Campaign info */}
                <div className="glass rounded-xl p-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/50">Nhà bán hàng</span>
                    <span className="text-white font-medium">{selectedCampaign.merchant?.businessName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50 flex items-center gap-1"><Calendar size={12} /> Bắt đầu</span>
                    <span className="text-white">{formatDate(selectedCampaign.startTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50 flex items-center gap-1"><Calendar size={12} /> Kết thúc</span>
                    <span className="text-white">{formatDate(selectedCampaign.endTime)}</span>
                  </div>
                  {selectedCampaign.description && (
                    <div className="pt-1 border-t border-white/8">
                      <p className="text-white/50 text-xs mb-1">Mô tả</p>
                      <p className="text-white/70 text-xs">{selectedCampaign.description}</p>
                    </div>
                  )}
                </div>

                {/* Products table */}
                {(selectedCampaign.campaignProducts?.length ?? 0) > 0 && (
                  <div className="glass rounded-xl overflow-hidden">
                    <p className="px-4 py-2.5 text-white/50 text-xs font-semibold uppercase tracking-wider border-b border-white/10 flex items-center gap-2">
                      <Package size={12} /> Sản phẩm ({selectedCampaign.campaignProducts?.length})
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5">
                          {['Tên SP', 'Gốc', 'Sale', 'Giảm', 'SL'].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-white/30">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedCampaign.campaignProducts ?? []).map((p) => {
                          const origPrice = p.product?.originalPrice ?? 0
                          const discount = origPrice > 0 ? calculateDiscount(Number(origPrice), p.salePrice) : 0
                          return (
                            <tr key={p.id} className="border-b border-white/5">
                              <td className="px-3 py-2 text-white/70 max-w-[120px]">
                                <p className="line-clamp-1">{p.product?.name ?? '—'}</p>
                              </td>
                              <td className="px-3 py-2 text-white/40 line-through">{origPrice > 0 ? formatCurrency(Number(origPrice)) : '—'}</td>
                              <td className="px-3 py-2 text-indigo-300 font-bold">{formatCurrency(p.salePrice)}</td>
                              <td className="px-3 py-2">
                                {discount > 0 ? (
                                  <span className="bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full">-{discount}%</span>
                                ) : <span className="text-white/30">—</span>}
                              </td>
                              <td className="px-3 py-2 text-white/60">{p.saleQuantity}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Actions */}
                {selectedCampaign.status === 'APPROVED' && (
                  <div className="space-y-3 pt-2">
                    {!showRejectForm ? (
                      <div className="flex gap-3">
                        <button
                          onClick={() => setConfirmApprove(selectedCampaign.id)}
                          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                        >
                          Duyệt chiến dịch
                        </button>
                        <button onClick={() => setShowRejectForm(true)} className="flex-1 btn-glass text-red-300 border-red-500/20 text-sm py-2.5">
                          Từ chối
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="input-glass resize-none w-full"
                          rows={3}
                          placeholder="Lý do từ chối..."
                        />
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleReject(selectedCampaign.id)}
                            disabled={!rejectReason.trim() || rejecting}
                            className="flex-1 py-2.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {rejecting ? <><Loader2 className="w-4 h-4 animate-spin" />Đang xử lý...</> : 'Xác nhận từ chối'}
                          </button>
                          <button onClick={() => setShowRejectForm(false)} className="flex-1 btn-glass text-sm py-2.5">Hủy</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedCampaign.status === 'SCHEDULED' && (
                  <div className="pt-2">
                    <div className="glass rounded-xl p-3 mb-3 border border-amber-500/20">
                      <p className="text-amber-300/80 text-xs flex items-center gap-1.5">
                        <Zap size={12} className="shrink-0" />
                        <span>Debug/Testing only — Force start sẽ kích hoạt chiến dịch ngay lập tức, bỏ qua thời gian lên lịch.</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmForceStart(selectedCampaign.id)}
                      className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                    >
                      <Zap size={14} />
                      Force Start
                    </button>
                  </div>
                )}

                {selectedCampaign.status === 'ACTIVE' && (
                  <div className="pt-2">
                    <div className="glass rounded-xl p-3 mb-3 border border-red-500/20">
                      <p className="text-red-300/80 text-xs flex items-center gap-1.5">
                        <Zap size={12} className="shrink-0" />
                        <span>Debug/Testing only — Force stop sẽ kết thúc chiến dịch ngay lập tức và sync stock về DB.</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmForceStop(selectedCampaign.id)}
                      className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                    >
                      <Zap size={14} />
                      Force Stop
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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

      <ConfirmDialog
        open={!!confirmForceStart}
        title="Force Start chiến dịch?"
        description="Chiến dịch sẽ chuyển sang ACTIVE ngay lập tức, bỏ qua thời gian đã lên lịch. Thông báo sẽ được gửi đến người đăng ký. Hành động này chỉ dùng cho debug/testing."
        confirmLabel="Bắt đầu ngay"
        cancelLabel="Hủy"
        onConfirm={() => confirmForceStart && handleForceStart(confirmForceStart)}
        onCancel={() => setConfirmForceStart(null)}
        loading={forceStarting}
      />

      <ConfirmDialog
        open={!!confirmForceStop}
        title="Force Stop chiến dịch?"
        description="Chiến dịch sẽ chuyển sang ENDED ngay lập tức. Stock còn lại sẽ được sync về database. Hành động này chỉ dùng cho debug/testing."
        confirmLabel="Dừng ngay"
        cancelLabel="Hủy"
        onConfirm={() => confirmForceStop && handleForceStop(confirmForceStop)}
        onCancel={() => setConfirmForceStop(null)}
        loading={forceStoping}
      />
    </div>
  )
}
