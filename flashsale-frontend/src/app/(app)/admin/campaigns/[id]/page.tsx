'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  Loader2,
  Package,
  Store,
  Tag,
  Trash2,
  Zap,
} from 'lucide-react'
import { useCampaign } from '@/hooks/queries/useCampaign'
import { useApproveCampaign } from '@/hooks/mutations/useApproveCampaign'
import { useRejectCampaign } from '@/hooks/mutations/useRejectCampaign'
import { useForceStartCampaign } from '@/hooks/mutations/useForceStartCampaign'
import { useForceStopCampaign } from '@/hooks/mutations/useForceStopCampaign'
import { useDeleteExpiredCampaign } from '@/hooks/mutations/useDeleteExpiredCampaign'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { calculateDiscount, formatCurrency, formatDate } from '@/lib/utils'
import type { CampaignStatus } from '@/types'

export default function AdminCampaignDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const campaignId = useMemo(() => {
    const raw = params?.id
    return Array.isArray(raw) ? raw[0] : raw ?? null
  }, [params])

  const { data: campaign, loading, error, refetch } = useCampaign(campaignId)

  const { approve, loading: approving } = useApproveCampaign()
  const { reject, loading: rejecting } = useRejectCampaign()
  const { forceStart, loading: forceStarting } = useForceStartCampaign()
  const { forceStop, loading: forceStoping } = useForceStopCampaign()
  const { deleteExpired, loading: deletingExpired } = useDeleteExpiredCampaign()

  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [confirmForceStart, setConfirmForceStart] = useState(false)
  const [confirmForceStop, setConfirmForceStop] = useState(false)
  const [confirmDeleteExpired, setConfirmDeleteExpired] = useState(false)

  const productStats = useMemo(() => {
    const products = campaign?.campaignProducts ?? []
    const total = products.reduce((sum, item) => sum + (item.saleQuantity ?? 0), 0)
    const remaining = products.reduce((sum, item) => sum + (item.remainingQuantity ?? 0), 0)
    const sold = Math.max(total - remaining, 0)
    const soldRate = total > 0 ? Math.round((sold / total) * 100) : 0

    return {
      count: products.length,
      total,
      remaining,
      sold,
      soldRate,
    }
  }, [campaign])

  const status = (campaign?.status ?? 'DRAFT') as CampaignStatus

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/admin/campaigns')
  }

  const handleApprove = async () => {
    if (!campaignId) return
    try {
      await approve(campaignId)
      setConfirmApprove(false)
      refetch()
    } catch {}
  }

  const handleReject = async () => {
    if (!campaignId || !rejectReason.trim()) return
    try {
      await reject(campaignId, rejectReason.trim())
      setShowRejectForm(false)
      setRejectReason('')
      refetch()
    } catch {}
  }

  const handleForceStart = async () => {
    if (!campaignId) return
    try {
      await forceStart(campaignId)
      setConfirmForceStart(false)
      refetch()
    } catch {}
  }

  const handleForceStop = async () => {
    if (!campaignId) return
    try {
      await forceStop(campaignId)
      setConfirmForceStop(false)
      refetch()
    } catch {}
  }

  const handleDeleteExpired = async () => {
    if (!campaignId) return
    try {
      await deleteExpired(campaignId)
      setConfirmDeleteExpired(false)
      router.push('/admin/campaigns?status=ENDED')
    } catch {}
  }

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="glass rounded-2xl p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-white/70 mx-auto mb-3" />
            <p className="text-white/70">Đang tải chi tiết campaign...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={handleBack}
            className="mb-4 p-2 rounded-xl glass text-white/80 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Quay lại"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <EmptyState
            icon={AlertCircle}
            title="Không tìm thấy campaign"
            description={error ?? 'Campaign có thể đã bị xóa hoặc không còn khả dụng.'}
            action={{
              label: 'Quay về danh sách campaign',
              onClick: () => router.push('/admin/campaigns'),
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="glass rounded-2xl p-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
          <button
            onClick={handleBack}
            className="p-2 rounded-xl glass text-white/80 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Quay lại"
            title="Quay lại"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Link href="/admin/campaigns" className="btn-glass text-sm px-3 py-1.5">Danh sách campaign</Link>
          <Link href={`/admin/campaign-monitor?campaignId=${campaign.id}`} className="btn-glass text-sm px-3 py-1.5">Campaign Monitor</Link>
          <Link href={`/admin/merchant-profiles/${campaign.merchantId}`} className="btn-glass text-sm px-3 py-1.5">Merchant Profile</Link>
        </div>

        <section className="glass rounded-3xl p-5 md:p-7 border border-white/10">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2 min-w-0">
              <p className="text-xs uppercase tracking-wider text-indigo-200/70">Campaign Detail</p>
              <h1 className="text-white text-2xl md:text-3xl font-bold leading-tight break-words">{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
              <p className="text-white/70 text-sm md:text-base max-w-3xl">
                {campaign.description?.trim() || 'Campaign chưa có mô tả chi tiết từ merchant.'}
              </p>
            </div>
            <div className="glass rounded-2xl p-4 md:p-5 min-w-[220px] border border-white/10 space-y-2">
              <p className="text-white/50 text-xs">Nhà bán hàng</p>
              <p className="text-white font-semibold text-sm md:text-base break-words">
                {campaign.merchant?.businessName ?? 'Merchant không xác định'}
              </p>
              <p className="text-xs text-white/50 font-mono break-all">{campaign.merchantId}</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass rounded-2xl p-4 border border-white/10">
            <p className="text-white/50 text-xs flex items-center gap-1 mb-2"><Calendar size={12} /> Bắt đầu</p>
            <p className="text-white font-semibold text-sm">{formatDate(campaign.startTime)}</p>
          </div>
          <div className="glass rounded-2xl p-4 border border-white/10">
            <p className="text-white/50 text-xs flex items-center gap-1 mb-2"><Clock size={12} /> Kết thúc</p>
            <p className="text-white font-semibold text-sm">{formatDate(campaign.endTime)}</p>
          </div>
          <div className="glass rounded-2xl p-4 border border-white/10">
            <p className="text-white/50 text-xs flex items-center gap-1 mb-2"><Package size={12} /> Sản phẩm</p>
            <p className="text-white font-semibold text-sm">{productStats.count} sản phẩm</p>
          </div>
          <div className="glass rounded-2xl p-4 border border-white/10">
            <p className="text-white/50 text-xs flex items-center gap-1 mb-2"><Store size={12} /> Tồn kho campaign</p>
            <p className="text-white font-semibold text-sm">{productStats.remaining} / {productStats.total}</p>
            <p className="text-[11px] text-emerald-300/90 mt-1">Đã bán: {productStats.sold} ({productStats.soldRate}%)</p>
          </div>
        </section>

        <section className="glass rounded-2xl p-5 border border-white/10 space-y-4">
          <div>
            <h2 className="text-white font-semibold text-base">Thao tác quản trị</h2>
            <p className="text-white/60 text-sm mt-1">
              Tùy theo trạng thái hiện tại của campaign, bạn có thể duyệt, từ chối hoặc điều phối nhanh cho mục đích vận hành.
            </p>
          </div>

          {status === 'APPROVED' && (
            <div className="space-y-3">
              {!showRejectForm ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => setConfirmApprove(true)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                  >
                    Duyệt campaign
                  </button>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-all"
                  >
                    Từ chối campaign
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="input-glass resize-none w-full"
                    rows={3}
                    placeholder="Nhập lý do từ chối để merchant có thể chỉnh sửa và gửi lại..."
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleReject}
                      disabled={!rejectReason.trim() || rejecting}
                      className="px-4 py-2.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {rejecting ? <><Loader2 className="w-4 h-4 animate-spin" />Đang xử lý...</> : 'Xác nhận từ chối'}
                    </button>
                    <button
                      onClick={() => {
                        setShowRejectForm(false)
                        setRejectReason('')
                      }}
                      className="btn-glass px-4 py-2.5 text-sm"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'SCHEDULED' && (
            <div className="space-y-3">
              <div className="glass rounded-xl p-3 border border-amber-500/20">
                <p className="text-amber-200/90 text-xs flex items-start gap-2">
                  <Zap size={12} className="shrink-0 mt-0.5" />
                  <span>Force Start chỉ dùng khi cần kiểm thử hoặc xử lý sự cố vận hành khẩn cấp.</span>
                </p>
              </div>
              <button
                onClick={() => setConfirmForceStart(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
              >
                <Zap size={14} /> Force Start
              </button>
            </div>
          )}

          {status === 'ACTIVE' && (
            <div className="space-y-3">
              <div className="glass rounded-xl p-3 border border-red-500/20">
                <p className="text-red-200/90 text-xs flex items-start gap-2">
                  <Zap size={12} className="shrink-0 mt-0.5" />
                  <span>Force Stop sẽ kết thúc campaign ngay lập tức và đồng bộ tồn kho về hệ thống.</span>
                </p>
              </div>
              <button
                onClick={() => setConfirmForceStop(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
              >
                <Zap size={14} /> Force Stop
              </button>
            </div>
          )}

          {status === 'ENDED' && (
            <div className="space-y-3">
              <div className="glass rounded-xl p-3 border border-red-500/20">
                <p className="text-red-200/90 text-xs flex items-start gap-2">
                  <Trash2 size={12} className="shrink-0 mt-0.5" />
                  <span>Campaign đã kết thúc có thể xóa mềm khỏi giao diện quản trị để giảm nhiễu dữ liệu.</span>
                </p>
              </div>
              <button
                onClick={() => setConfirmDeleteExpired(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}
              >
                <Trash2 size={14} /> Xóa campaign hết hạn
              </button>
            </div>
          )}

          {status === 'DRAFT' && (
            <p className="text-xs text-white/55">
              Trạng thái hiện tại: {status}. Campaign đang ở bản nháp, chưa đủ điều kiện cho thao tác vận hành nâng cao.
            </p>
          )}
        </section>

        <section className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="text-white font-semibold text-base flex items-center gap-2">
              <Tag size={14} /> Sản phẩm đang bán trong campaign
            </h2>
            <p className="text-white/60 text-sm mt-1">Admin có thể kiểm tra giá sale, mức giảm và tồn kho còn lại theo từng sản phẩm.</p>
          </div>

          {campaign.campaignProducts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Package}
                title="Campaign chưa có sản phẩm"
                description="Merchant chưa gắn sản phẩm cho chiến dịch này."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    {['Sản phẩm', 'Giá gốc', 'Giá sale', 'Giảm', 'Số lượng bán', 'Còn lại'].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-white/45 font-medium text-xs uppercase tracking-wider">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaign.campaignProducts.map((item) => {
                    const originalPrice = Number(item.product?.originalPrice ?? 0)
                    const discount = originalPrice > 0 ? calculateDiscount(originalPrice, item.salePrice) : 0

                    return (
                      <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {item.product?.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.product.imageUrl}
                                alt={item.product?.name ?? 'Product image'}
                                className="w-12 h-12 rounded-lg object-cover border border-white/10"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg glass flex items-center justify-center border border-white/10">
                                <Package size={14} className="text-white/50" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-white font-medium line-clamp-2">{item.product?.name ?? 'Sản phẩm không xác định'}</p>
                              <p className="text-xs text-white/45 font-mono">{item.productId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/45 line-through">{originalPrice > 0 ? formatCurrency(originalPrice) : 'N/A'}</td>
                        <td className="px-4 py-3 text-indigo-300 font-semibold">{formatCurrency(item.salePrice)}</td>
                        <td className="px-4 py-3">
                          {discount > 0 ? (
                            <span className="px-2 py-1 rounded-full bg-orange-500/20 text-orange-300 text-xs font-semibold">-{discount}%</span>
                          ) : (
                            <span className="text-white/35">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/75">{item.saleQuantity}</td>
                        <td className="px-4 py-3 text-white/75">{item.remainingQuantity}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmApprove}
        title="Duyệt campaign?"
        description="Campaign sẽ được lên lịch theo thời gian cấu hình."
        confirmLabel="Duyệt"
        cancelLabel="Hủy"
        onConfirm={handleApprove}
        onCancel={() => setConfirmApprove(false)}
        loading={approving}
      />

      <ConfirmDialog
        open={confirmForceStart}
        title="Bắt đầu campaign ngay lập tức?"
        description="Campaign sẽ chuyển sang ACTIVE ngay lập tức, bỏ qua lịch cài đặt."
        confirmLabel="Force Start"
        cancelLabel="Hủy"
        onConfirm={handleForceStart}
        onCancel={() => setConfirmForceStart(false)}
        loading={forceStarting}
      />

      <ConfirmDialog
        open={confirmForceStop}
        title="Dừng campaign ngay lập tức?"
        description="Campaign sẽ chuyển sang ENDED và hệ thống đồng bộ tồn kho về database."
        confirmLabel="Force Stop"
        cancelLabel="Hủy"
        onConfirm={handleForceStop}
        onCancel={() => setConfirmForceStop(false)}
        loading={forceStoping}
      />

      <ConfirmDialog
        open={confirmDeleteExpired}
        title="Xóa mềm campaign đã hết hạn?"
        description="Campaign ENDED sẽ bị ẩn khỏi danh sách quản trị. Hành động này không thể hoàn tác trên UI."
        confirmLabel="Xóa campaign"
        cancelLabel="Hủy"
        variant="destructive"
        onConfirm={handleDeleteExpired}
        onCancel={() => setConfirmDeleteExpired(false)}
        loading={deletingExpired}
      />
    </div>
  )
}
