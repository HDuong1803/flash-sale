'use client'

import { use, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Calendar, Package, BarChart3, Zap, Edit3,
  Send, Trash2, AlertCircle, Store, TrendingUp, ShoppingCart,
  Clock, Tag, CheckCircle2, ImageOff, Loader2, ExternalLink,
  ReceiptText,
} from 'lucide-react'
import { useCampaign } from '@/hooks/queries/useCampaign'
import { useMerchantRevenue } from '@/hooks/queries/useMerchantRevenue'
import { useSubmitCampaign } from '@/hooks/mutations/useSubmitCampaign'
import { useDeleteCampaign } from '@/hooks/mutations/useDeleteCampaign'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { StockProgressBar } from '@/components/shared/StockProgressBar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CampaignCardSkeleton } from '@/components/shared/skeletons/CampaignCardSkeleton'
import { formatCurrency, formatDate, calculateDiscount } from '@/lib/utils'

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function MetricCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: typeof BarChart3; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="glass rounded-2xl p-5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-white/45 text-xs">{label}</span>
        <div className={`p-1.5 rounded-lg ${color}`}>
          <Icon size={14} className="text-white" />
        </div>
      </div>
      <p className="text-white text-xl font-bold">{value}</p>
      {sub && <p className="text-white/35 text-xs">{sub}</p>}
    </div>
  )
}

export default function MerchantCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({})

  const { data: campaign, loading, error } = useCampaign(id)
  const { mutate: submitCampaign, loading: submitting } = useSubmitCampaign()
  const { mutate: deleteCampaign, loading: deleting } = useDeleteCampaign()

  // Range bao phủ toàn bộ campaign để lấy revenue đúng
  const revenueRange = useMemo(() => {
    if (!campaign) return { startDate: toDateStr(new Date(Date.now() - 30 * 86400_000)), endDate: toDateStr(new Date()) }
    return {
      startDate: toDateStr(new Date(campaign.startTime)),
      endDate: toDateStr(new Date(Math.min(new Date(campaign.endTime).getTime(), Date.now()))),
    }
  }, [campaign])

  const { data: revenue } = useMerchantRevenue(revenueRange)

  // Tìm số liệu của campaign này trong breakdown
  const campaignRevenue = revenue?.byCampaign.find(c => c.campaignId === id)
  const revenueSummary = {
    revenue: campaignRevenue?.revenue ?? 0,
    orders: campaignRevenue?.orders ?? 0,
    avgOrderValue: campaignRevenue && campaignRevenue.orders > 0
      ? Math.round(campaignRevenue.revenue / campaignRevenue.orders)
      : 0,
  }

  const isActive = campaign?.status === 'ACTIVE'
  const isScheduled = campaign?.status === 'SCHEDULED'
  const isDraft = campaign?.status === 'DRAFT'
  const isEnded = campaign?.status === 'ENDED'

  const totalStock = (campaign?.campaignProducts ?? []).reduce((s, p) => s + p.saleQuantity, 0)
  const totalRemaining = (campaign?.campaignProducts ?? []).reduce((s, p) => s + p.remainingQuantity, 0)
  const totalSold = totalStock - totalRemaining

  const handleSubmit = async () => {
    if (!campaign) return
    await submitCampaign(campaign.id)
  }

  const handleDelete = async () => {
    if (!campaign) return
    await deleteCampaign(campaign.id)
    router.push('/merchant/campaigns')
  }

  // ─── Loading / Error ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => <CampaignCardSkeleton key={i} />)}
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error ?? 'Không tìm thấy chiến dịch'}</p>
          <button onClick={() => router.push('/merchant/campaigns')} className="btn-glass text-sm px-4 py-2">
            ← Về danh sách
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push('/merchant/campaigns')}
            className="text-white/40 hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-white text-xl font-bold truncate">{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
            </div>
            <p className="text-white/35 text-xs mt-0.5">
              {campaign.merchant?.businessName} · Tạo {formatDate(campaign.createdAt)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {isActive && (
            <Link
              href={`/merchant/campaigns/${id}/dashboard`}
              className="flex items-center gap-1.5 text-sm btn-primary px-3 py-2"
            >
              <Zap size={14} />
              Bảng điều khiển trực tiếp
            </Link>
          )}
          {(isDraft || isScheduled) && (
            <Link
              href={`/merchant/campaigns/${id}/edit`}
              className="flex items-center gap-1.5 text-sm btn-glass px-3 py-2"
            >
              <Edit3 size={14} />
              Chỉnh sửa
            </Link>
          )}
          {isDraft && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 text-sm btn-primary px-3 py-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Gửi duyệt
            </button>
          )}
          {(isDraft || isEnded) && (
            <button
              onClick={() => setDeleteDialogOpen(true)}
              className="flex items-center gap-1.5 text-sm btn-glass px-3 py-2 text-red-400 border-red-400/30 hover:bg-red-400/10"
            >
              <Trash2 size={14} />
              Xoá
            </button>
          )}
          {/* Link xem từ góc nhìn khách hàng */}
          <Link
            href={`/campaigns/${id}`}
            target="_blank"
            className="flex items-center gap-1.5 text-sm btn-glass px-3 py-2 text-white/40"
            title="Xem như khách hàng"
          >
            <ExternalLink size={14} />
          </Link>
        </div>
      </div>

      {/* ── Countdown / thời gian ─────────────────────────────────────────────── */}
      {(isActive || isScheduled) && (
        <div className="glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <Clock size={14} className="text-indigo-400" />
            {isActive ? 'Kết thúc sau:' : 'Bắt đầu sau:'}
          </div>
          <CountdownTimer targetDate={isActive ? campaign.endTime : campaign.startTime} size="md" />
        </div>
      )}

      {/* ── Metrics 4 cols ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Package} label="Sản phẩm" value={String(campaign.campaignProducts.length)} color="bg-indigo-500/20" />
        <MetricCard icon={BarChart3} label="Tổng SL flash" value={totalStock.toLocaleString()} sub={`Đã bán: ${totalSold}`} color="bg-blue-500/20" />
        <MetricCard icon={ShoppingCart} label="Đơn hàng" value={revenueSummary.orders.toLocaleString()} sub="Từ chiến dịch này" color="bg-emerald-500/20" />
        <MetricCard icon={TrendingUp} label="Doanh thu" value={formatCurrency(revenueSummary.revenue)} sub={revenueSummary.avgOrderValue > 0 ? `TB ${formatCurrency(revenueSummary.avgOrderValue)}/đơn` : undefined} color="bg-purple-500/20" />
      </div>

      {/* ── Sản phẩm trong chiến dịch ──────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold">Sản phẩm trong chiến dịch</h2>
          <span className="text-white/30 text-xs">{campaign.campaignProducts.length} sản phẩm</span>
        </div>

        <div className="divide-y divide-white/5">
          {campaign.campaignProducts.map((cp) => {
            const remaining = cp.remainingQuantity
            const total = cp.saleQuantity
            const sold = Math.max(0, total - remaining)
            const pct = total > 0 ? remaining / total : 0
            const discount = calculateDiscount(cp.product?.originalPrice ?? 0, cp.salePrice)
            const isCritical = pct < 0.1 && isActive
            const isLow = pct < 0.3 && isActive

            return (
              <div key={cp.id} className="px-6 py-4 flex items-center gap-4">
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 glass">
                  {cp.product?.imageUrl && !imgErrors[cp.id] ? (
                    <Image
                      src={cp.product.imageUrl}
                      alt={cp.product?.name ?? ''}
                      width={56} height={56}
                      className="object-cover w-full h-full"
                      onError={() => setImgErrors(prev => ({ ...prev, [cp.id]: true }))}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageOff size={18} className="text-white/20" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="text-white/85 text-sm font-medium truncate">
                      {cp.product?.name ?? `Sản phẩm ${cp.productId.slice(-6)}`}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {discount > 0 && (
                        <span className="text-xs font-bold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">
                          -{discount}%
                        </span>
                      )}
                      {isCritical && (
                        <span className="text-xs font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded animate-pulse">
                          Sắp hết
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-white/40 flex-wrap">
                    <span className="line-through">{formatCurrency(cp.product?.originalPrice ?? 0)}</span>
                    <span className="text-indigo-300 font-bold text-sm">{formatCurrency(cp.salePrice)}</span>
                    <span>Giới hạn {cp.perUserLimit}/người</span>
                  </div>

                  <StockProgressBar remaining={remaining} total={total} size="sm" />

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/40">
                      Đã bán: <span className="text-indigo-300 font-semibold">{sold}</span>
                      <span className="text-white/20 ml-1">/ {total}</span>
                    </span>
                    <span className={`font-semibold ${
                      isCritical ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-white/50'
                    }`}>
                      Còn {remaining} ({Math.round(pct * 100)}%)
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Thông tin chiến dịch ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Campaign info */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-white font-semibold">Thông tin chiến dịch</h2>
          </div>
          <div className="p-4 space-y-0">
            {[
              { icon: Store, label: 'Tên chiến dịch', value: campaign.name },
              { icon: Calendar, label: 'Bắt đầu', value: formatDate(campaign.startTime) },
              { icon: Calendar, label: 'Kết thúc', value: formatDate(campaign.endTime) },
              { icon: Tag, label: 'Hoa hồng', value: campaign.commissionRate != null ? `${campaign.commissionRate}%` : 'Theo danh mục' },
              { icon: CheckCircle2, label: 'Tổng tồn kho', value: `${totalRemaining.toLocaleString()} / ${totalStock.toLocaleString()}` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2 text-white/45 text-xs">
                  <Icon size={13} />
                  {label}
                </div>
                <span className="text-white/75 text-xs font-medium text-right max-w-[55%] truncate">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Description + revenue link */}
        <div className="space-y-4">
          {campaign.description && (
            <div className="glass rounded-2xl p-5 space-y-2">
              <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider">Mô tả</h3>
              <p className="text-white/65 text-sm leading-relaxed line-clamp-5">{campaign.description}</p>
            </div>
          )}

          <div className="glass rounded-2xl p-5 space-y-3">
            <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider">Liên kết nhanh</h3>
            <div className="space-y-2">
              {isActive && (
                <Link href={`/merchant/campaigns/${id}/dashboard`}
                  className="flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors">
                  <div className="flex items-center gap-2 text-indigo-300 text-sm">
                    <Zap size={15} />
                    Bảng điều khiển trực tiếp
                  </div>
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live" />
                    Live
                  </span>
                </Link>
              )}
              <Link href={`/merchant/revenue`}
                className="flex items-center justify-between p-3 rounded-xl glass hover:bg-white/8 transition-colors">
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <ReceiptText size={15} />
                  Báo cáo doanh thu
                </div>
                <ArrowLeft size={13} className="text-white/30 rotate-180" />
              </Link>
              <Link href={`/campaigns/${id}`} target="_blank"
                className="flex items-center justify-between p-3 rounded-xl glass hover:bg-white/8 transition-colors">
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <ExternalLink size={15} />
                  Xem từ góc nhìn khách hàng
                </div>
                <ArrowLeft size={13} className="text-white/30 rotate-180" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete dialog ─────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Xoá chiến dịch?"
        description={`Bạn có chắc muốn xoá "${campaign.name}"? Hành động này không thể hoàn tác.`}
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialogOpen(false)}
        loading={deleting}
        variant="destructive"
      />
    </div>
  )
}
