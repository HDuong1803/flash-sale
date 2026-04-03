'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Zap, AlertCircle } from 'lucide-react'
import { useAdminCampaigns } from '@/hooks/queries/useAdminCampaigns'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import type { CampaignStatus } from '@/types'

const TABS: { label: string; value: CampaignStatus }[] = [
  { label: 'Chờ duyệt', value: 'APPROVED' },
  { label: 'Đã duyệt', value: 'SCHEDULED' },
  { label: 'Đang chạy', value: 'ACTIVE' },
  { label: 'Đã kết thúc', value: 'ENDED' },
]

export default function AdminCampaignsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialSearch = searchParams.get('search') ?? ''
  const [activeTab, setActiveTab] = useState<CampaignStatus>('APPROVED')
  const [search, setSearch] = useState(initialSearch)

  const { data: campaigns, loading, error, refetch } = useAdminCampaigns(activeTab)

  const filteredCampaigns = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return campaigns
    return campaigns.filter((campaign) => {
      const name = campaign.name?.toLowerCase() ?? ''
      const merchantName = campaign.merchant?.businessName?.toLowerCase() ?? ''
      const merchantId = campaign.merchantId?.toLowerCase() ?? ''
      return (
        name.includes(keyword) ||
        merchantName.includes(keyword) ||
        merchantId.includes(keyword)
      )
    })
  }, [campaigns, search])

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/admin/overview')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-white text-2xl font-bold">Quản lý Chiến dịch</h1>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleBack}
          className="btn-glass text-xs px-3 py-1.5 inline-flex items-center justify-center"
          aria-label="Quay lại"
          title="Quay lại"
        >
          <ArrowLeft size={14} />
        </button>
        <Link href="/admin/campaign-monitor" className="btn-glass text-xs px-3 py-1.5">Giám sát chiến dịch</Link>
        <Link href="/admin/merchant-profiles" className="btn-glass text-xs px-3 py-1.5">Hồ sơ nhà bán hàng</Link>
        <Link href="/admin/merchants" className="btn-glass text-xs px-3 py-1.5">KYC nhà bán hàng</Link>
      </div>

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

      <div className="glass rounded-2xl p-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo tên chiến dịch, tên nhà bán hàng..."
          className="input-glass w-full"
        />
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
      ) : filteredCampaigns.length === 0 ? (
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
                {filteredCampaigns.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-white font-medium text-sm max-w-[200px]">
                      <Link href={`/admin/campaigns/${c.id}`} className="line-clamp-1 text-indigo-300 hover:text-indigo-200">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-white/60 text-sm">
                      <Link
                        href={`/admin/merchant-profiles/${c.merchantId}`}
                        className="text-indigo-300 hover:text-indigo-200 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.merchant?.businessName}
                      </Link>
                      <p className="text-[10px] text-white/35 mt-0.5">Key: {c.merchantId}</p>
                    </td>
                    <td className="px-4 py-3 text-white/60 text-sm">{c.campaignProducts?.length ?? 0}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">
                      <p>{formatDate(c.startTime)}</p>
                      <p>→ {formatDate(c.endTime)}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/campaigns/${c.id}`} className="btn-glass text-xs px-3 py-1.5">
                        Xem chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
