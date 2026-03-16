'use client'

import { useState } from 'react'
import { Zap, AlertCircle } from 'lucide-react'
import { useCampaigns } from '@/hooks/queries/useCampaigns'
import { CampaignCard } from '@/components/customer/CampaignCard'
import { CampaignCardSkeleton } from '@/components/shared/skeletons/CampaignCardSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import type { CampaignStatus } from '@/types'

const STATUS_TABS: { label: string; value: CampaignStatus | 'ALL' }[] = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Đang diễn ra', value: 'ACTIVE' },
  { label: 'Sắp diễn ra', value: 'SCHEDULED' },
  { label: 'Đã kết thúc', value: 'ENDED' },
]

export default function CampaignsPage() {
  const [activeTab, setActiveTab] = useState<CampaignStatus | 'ALL'>('ALL')
  const { data: campaigns, loading, error, refetch } = useCampaigns()

  const filtered = activeTab === 'ALL'
    ? campaigns
    : campaigns.filter((c) => c.status === activeTab)

  const activeCampaign = campaigns.find((c) => c.status === 'ACTIVE')
  const scheduledCampaign = campaigns.find((c) => c.status === 'SCHEDULED')
  const heroCampaign = activeCampaign ?? scheduledCampaign

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Hero Banner */}
      <div className="rounded-2xl overflow-hidden relative"
        style={{ background: 'linear-gradient(135deg, #312e81 0%, #1e1b4b 50%, #0f0a2a 100%)' }}>
        <div className="absolute inset-0 opacity-20"
          style={{ background: 'radial-gradient(circle at 30% 50%, rgba(99,102,241,0.6) 0%, transparent 70%)' }} />
        <div className="relative px-8 py-10">
          {heroCampaign ? (
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {activeCampaign ? (
                    <span className="flex items-center gap-1.5 bg-red-500/20 border border-red-500/30 rounded-full px-3 py-1 text-red-300 text-xs font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-live" />
                      ĐANG DIỄN RA
                    </span>
                  ) : (
                    <span className="bg-blue-500/20 border border-blue-500/30 rounded-full px-3 py-1 text-blue-300 text-xs font-bold">SẮP BẮT ĐẦU</span>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                  {activeCampaign ? 'Flash Sale đang diễn ra!' : 'Flash Sale sắp bắt đầu'}
                </h1>
                <p className="text-white/60 text-sm">{heroCampaign.name}</p>
              </div>
              <div className="flex flex-col items-center gap-3">
                <CountdownTimer
                  targetDate={activeCampaign ? activeCampaign.endTime : scheduledCampaign!.startTime}
                  size="lg"
                  showDays
                />
                {activeCampaign && (
                  <a href={`/campaigns/${activeCampaign.id}`} className="btn-primary text-sm px-6 py-2">
                    Xem ngay →
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <Zap size={40} className="mx-auto mb-3 text-indigo-400" />
              <h1 className="text-2xl md:text-3xl font-bold gradient-text">Khám phá Flash Sale</h1>
              <p className="text-white/50 mt-2">Những deal tốt nhất với giá giảm sâu</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.value
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'glass text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CampaignCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button onClick={refetch} className="btn-glass text-sm px-4 py-2">Thử lại</button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Chưa có flash sale nào"
          description="Dữ liệu sẽ hiển thị khi có kết nối đến máy chủ"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  )
}
