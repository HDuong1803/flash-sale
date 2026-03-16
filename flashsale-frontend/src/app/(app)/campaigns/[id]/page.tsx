'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { Store, AlertCircle, ArrowLeft, Minus, Plus, Info, Loader2 } from 'lucide-react'
import { useCampaign } from '@/hooks/queries/useCampaign'
import { usePurchase } from '@/hooks/mutations/usePurchase'
import { usePreRegister } from '@/hooks/mutations/usePreRegister'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { StockProgressBar } from '@/components/shared/StockProgressBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CampaignCardSkeleton } from '@/components/shared/skeletons/CampaignCardSkeleton'
import { formatCurrency, calculateDiscount, formatDate } from '@/lib/utils'

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: campaign, loading, error } = useCampaign(id)
  const { purchase, loading: buyLoading } = usePurchase()
  const { preRegister, loading: regLoading } = usePreRegister()
  const { isAuthenticated } = useAuthStore()
  const { openAuthModal } = useUiStore()
  const [quantity, setQuantity] = useState(1)
  const [selectedProductIdx, setSelectedProductIdx] = useState(0)
  const [activeTab, setActiveTab] = useState<'desc' | 'seller'>('desc')

  const product = campaign?.products[selectedProductIdx]
  const discount = product ? calculateDiscount(product.originalPrice, product.salePrice) : 0
  const isSoldOut = product ? product.remainingQuantity === 0 : false
  const isActive = campaign?.status === 'ACTIVE'
  const isScheduled = campaign?.status === 'SCHEDULED'

  const handleBuy = async () => {
    if (!isAuthenticated) { openAuthModal('login'); return }
    if (!product) return
    try {
      const { requestId } = await purchase(product.id, quantity)
      router.push(`/purchase/waiting/${requestId}`)
    } catch { /* toast shown */ }
  }

  const handlePreRegister = async () => {
    if (!isAuthenticated) { openAuthModal('login'); return }
    if (!campaign) return
    try { await preRegister(campaign.id) } catch { /* toast shown */ }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {Array.from({ length: 2 }).map((_, i) => <CampaignCardSkeleton key={i} />)}
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/60 text-sm mb-4">{error ?? 'Không tìm thấy chiến dịch'}</p>
          <button onClick={() => router.push('/campaigns')} className="btn-glass text-sm px-4 py-2">
            ← Về danh sách
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors">
        <ArrowLeft size={16} /> Quay lại
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Image Gallery */}
        <div className="space-y-3">
          <div className="relative aspect-square glass rounded-2xl overflow-hidden">
            {product?.imageUrl ? (
              <Image src={product.imageUrl} alt={product.productName} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Store size={64} className="text-white/20" />
              </div>
            )}
            {isSoldOut && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <span className="glass-strong text-white font-bold text-lg px-6 py-3 rounded-xl">HẾT HÀNG</span>
              </div>
            )}
          </div>
          {/* Thumbnail strip */}
          {campaign.products.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {campaign.products.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProductIdx(i)}
                  className={`relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 transition-all ${i === selectedProductIdx ? 'ring-2 ring-indigo-500' : 'opacity-50 hover:opacity-80'}`}
                >
                  {p.imageUrl && <Image src={p.imageUrl} alt={p.productName} fill className="object-cover" sizes="64px" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Purchase Panel */}
        <div className="md:sticky md:top-24 space-y-4">
          <div className="glass rounded-2xl p-6 space-y-4">
            {/* Merchant */}
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Store size={14} />
              <span>{campaign.merchantName}</span>
              <StatusBadge status={campaign.status} />
            </div>

            {/* Title */}
            <h1 className="text-white text-2xl font-bold">{product?.productName ?? campaign.name}</h1>

            {/* Countdown */}
            {isActive && (
              <div className="glass-brand rounded-xl p-3 flex items-center justify-between">
                <span className="text-white/60 text-sm">Kết thúc sau</span>
                <CountdownTimer targetDate={campaign.endTime} size="md" />
              </div>
            )}
            {isScheduled && (
              <div className="glass rounded-xl p-3 flex items-center justify-between">
                <span className="text-white/60 text-sm">Bắt đầu lúc</span>
                <span className="text-indigo-300 text-sm font-medium">{formatDate(campaign.startTime)}</span>
              </div>
            )}

            {/* Price */}
            {product && (
              <div className="flex items-baseline gap-3">
                <span className="text-white/40 text-base line-through">{formatCurrency(product.originalPrice)}</span>
                <span className="text-indigo-300 text-3xl font-bold">{formatCurrency(product.salePrice)}</span>
                {discount > 0 && (
                  <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">-{discount}%</span>
                )}
              </div>
            )}

            {/* Stock */}
            {product && (
              <div className="space-y-1.5">
                <StockProgressBar remaining={product.remainingQuantity} total={product.saleQuantity} showText size="md" />
              </div>
            )}

            {/* Quantity */}
            {product && product.perUserLimit > 1 && !isSoldOut && (
              <div className="flex items-center gap-3">
                <span className="text-white/60 text-sm">Số lượng:</span>
                <div className="flex items-center glass rounded-xl overflow-hidden">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-3 py-2 text-white/60 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="px-4 py-2 text-white font-medium min-w-[3rem] text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(product.perUserLimit, quantity + 1))}
                    className="px-3 py-2 text-white/60 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* CTA */}
            {isActive && !isSoldOut && (
              <button onClick={handleBuy} disabled={buyLoading} className="btn-primary w-full disabled:opacity-50">
                {buyLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang đặt hàng...
                  </span>
                ) : isAuthenticated ? 'Mua ngay' : 'Đăng nhập để mua'}
              </button>
            )}
            {isScheduled && (
              <button onClick={handlePreRegister} disabled={regLoading} className="btn-glass w-full disabled:opacity-50">
                {regLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang đăng ký...
                  </span>
                ) : 'Đăng ký nhắc nhở'}
              </button>
            )}
            {(campaign.status === 'ENDED' || isSoldOut) && (
              <button disabled className="w-full py-3 rounded-xl bg-white/5 text-white/30 cursor-not-allowed border border-white/10">
                {isSoldOut ? 'Đã hết hàng' : 'Chiến dịch đã kết thúc'}
              </button>
            )}

            {product && product.perUserLimit > 1 && (
              <div className="flex items-center gap-1.5 text-white/40 text-xs">
                <Info size={12} />
                <span>Tối đa {product.perUserLimit} sản phẩm/người</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex border-b border-white/10">
          {([['desc', 'Mô tả sản phẩm'], ['seller', 'Người bán']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-sm font-medium transition-all ${activeTab === tab ? 'text-indigo-300 border-b-2 border-indigo-500 -mb-px' : 'text-white/50 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p-6">
          {activeTab === 'desc' ? (
            <p className="text-white/70 text-sm leading-relaxed">{campaign.description || 'Chưa có mô tả sản phẩm.'}</p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-indigo-300 font-bold"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                {campaign.merchantName[0]}
              </div>
              <div>
                <p className="text-white font-semibold">{campaign.merchantName}</p>
                <p className="text-white/40 text-sm">Merchant đã xác minh</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
