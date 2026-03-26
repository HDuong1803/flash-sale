'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Megaphone, Plus, Calendar, Package, AlertCircle } from 'lucide-react'
import { useMyCampaigns } from '@/hooks/queries/useMyCampaigns'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { StockProgressBar } from '@/components/shared/StockProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CampaignCardSkeleton } from '@/components/shared/skeletons/CampaignCardSkeleton'
import { useDeleteCampaign } from '@/hooks/mutations/useDeleteCampaign'
import { formatDate } from '@/lib/utils'
import type { CampaignStatus } from '@/types'

const TABS: { label: string; value: CampaignStatus | 'ALL' }[] = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Nháp', value: 'DRAFT' },
  { label: 'Chờ duyệt', value: 'APPROVED' },
  { label: 'Đã lên lịch', value: 'SCHEDULED' },
  { label: 'Đang chạy', value: 'ACTIVE' },
  { label: 'Đã kết thúc', value: 'ENDED' },
]

export default function MerchantCampaignsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<CampaignStatus | 'ALL'>('ALL')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { data: campaigns, loading, error, refetch } = useMyCampaigns()
  const { mutate: deleteCampaign, loading: deleting } = useDeleteCampaign()

  const filtered = activeTab === 'ALL' ? campaigns : campaigns.filter((c) => c.status === activeTab)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-white text-2xl font-bold">Chiến dịch của tôi</h1>
        <Link href="/merchant/campaigns/create" className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Tạo chiến dịch mới
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.value ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'glass text-white/60 hover:text-white hover:bg-white/10'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CampaignCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Megaphone} title="Chưa có chiến dịch nào"
          description="Tạo chiến dịch đầu tiên của bạn"
          action={{ label: 'Tạo chiến dịch mới', onClick: () => router.push('/merchant/campaigns/create') }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((campaign) => {
            const totalStock = campaign.campaignProducts?.reduce((s, p) => s + p.saleQuantity, 0)
            const remaining = campaign.campaignProducts?.reduce((s, p) => s + p.remainingQuantity, 0)
            return (
              <div key={campaign.id} className="glass rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-white font-semibold line-clamp-2">{campaign.name}</h3>
                  <StatusBadge status={campaign.status} />
                </div>
                <div className="space-y-2 text-sm text-white/50">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    <span>{formatDate(campaign.startTime)} — {formatDate(campaign.endTime)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package size={14} />
                    <span>{(campaign.campaignProducts?.length ?? 0)} sản phẩm</span>
                    {campaign.status === 'ACTIVE' && (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live" />
                        ĐANG DIỄN RA
                      </span>
                    )}
                  </div>
                </div>
                {(campaign.status === 'ACTIVE' || campaign.status === 'ENDED') && totalStock > 0 && (
                  <StockProgressBar remaining={remaining} total={totalStock} showText size="sm" />
                )}
                <div className="flex gap-2 flex-wrap">
                  {campaign.status === 'DRAFT' && (
                    <>
                      <Link href={`/merchant/campaigns/create?edit=${campaign.id}`} className="btn-glass text-xs px-3 py-1.5">Chỉnh sửa</Link>
                      <button onClick={() => setDeleteId(campaign.id)} className="text-red-400 hover:text-red-300 text-xs px-3 py-1.5 rounded-xl transition-colors">Xóa</button>
                    </>
                  )}
                  {campaign.status === 'APPROVED' && (
                    <button disabled className="text-xs px-3 py-1.5 rounded-xl bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 cursor-not-allowed">Chờ admin duyệt</button>
                  )}
                  {campaign.status === 'ACTIVE' && (
                    <>
                      <Link href={`/merchant/campaigns/${campaign.id}/dashboard`} className="btn-primary text-xs px-3 py-1.5">Dashboard Live</Link>
                      <Link href="/merchant/orders" className="btn-glass text-xs px-3 py-1.5">Đơn hàng</Link>
                    </>
                  )}
                  {campaign.status === 'ENDED' && (
                    <Link href={`/merchant/campaigns/${campaign.id}/dashboard`} className="btn-glass text-xs px-3 py-1.5">Xem báo cáo</Link>
                  )}
                  {campaign.status === 'SCHEDULED' && (
                    <Link href={`/merchant/campaigns/${campaign.id}/dashboard`} className="btn-glass text-xs px-3 py-1.5">Xem chi tiết</Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Xóa chiến dịch?"
        description="Hành động này không thể hoàn tác."
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        variant="destructive"
        onConfirm={async () => { if (deleteId) { try { await deleteCampaign(deleteId) } finally { setDeleteId(null); refetch() } } }}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
    </div>
  )
}
