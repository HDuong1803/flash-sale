'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Store, Loader2 } from 'lucide-react'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { useCountdown } from '@/hooks/useCountdown'
import { usePurchase } from '@/hooks/mutations/usePurchase'
import { usePreRegister } from '@/hooks/mutations/usePreRegister'
import { StockProgressBar } from '@/components/shared/StockProgressBar'
import { formatCurrency, calculateDiscount } from '@/lib/utils'
import type { Campaign, CampaignProduct } from '@/types'
import { useRouter } from 'next/navigation'

interface CampaignCardProps {
  campaign: Campaign
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const router = useRouter()
  const { isAuthenticated } = useAuthContext()
  const { openAuthModal } = useUiContext()
  const { purchase, loading: buyLoading } = usePurchase()
  const { preRegister, loading: regLoading } = usePreRegister()

  // Use first product for display
  const product = campaign.campaignProducts?.[0] as CampaignProduct | undefined
  const discount = product ? calculateDiscount(product.product?.originalPrice ?? 0, product.salePrice) : 0
  const isSoldOut = product ? product.remainingQuantity === 0 : true
  const isActive = campaign.status === 'ACTIVE'
  const isScheduled = campaign.status === 'SCHEDULED'
  const isEnded = campaign.status === 'ENDED'

  const handleBuy = async () => {
    if (!isAuthenticated) { openAuthModal('login'); return }
    if (!product) return
    try {
      const { requestId } = await purchase(product.id, 1)
      router.push(`/purchase/waiting/${requestId}`)
    } catch { /* toast already shown */ }
  }

  const handlePreRegister = async () => {
    if (!isAuthenticated) { openAuthModal('login'); return }
    try { await preRegister(campaign.id) } catch { /* toast shown */ }
  }

  return (
    <Link href={`/campaigns/${campaign.id}`} className="group block">
      <div className="glass rounded-2xl overflow-hidden hover:border-white/20 transition-all hover:shadow-brand">
        {/* Image area */}
        <div className="relative aspect-square bg-white/5 overflow-hidden">
          {product?.product?.imageUrl ? (
            <Image
              src={product.product.imageUrl}
              alt={product.product?.name ?? ''}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Store size={40} className="text-white/20" />
            </div>
          )}

          {/* Status badges */}
          {isActive && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-500/90 backdrop-blur-sm rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-live" />
              <span className="text-white text-xs font-bold">LIVE</span>
            </div>
          )}
          {isScheduled && (
            <div className="absolute top-2 left-2 bg-blue-500/90 backdrop-blur-sm rounded-full px-2.5 py-1">
              <span className="text-white text-xs font-bold">SẮP MỞ</span>
            </div>
          )}
          {isEnded && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white/70 font-bold text-sm">ĐÃ KẾT THÚC</span>
            </div>
          )}

          {/* Countdown overlay for active campaigns */}
          {isActive && <ActiveCountdown endTime={campaign.endTime} />}

          {/* Discount badge */}
          {discount > 0 && !isEnded && (
            <div className="absolute top-2 right-2 bg-orange-500 rounded-full px-2 py-0.5">
              <span className="text-white text-xs font-bold">-{discount}%</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="text-white font-semibold text-sm line-clamp-1">{campaign.name}</h3>
            <p className="text-white/50 text-xs mt-0.5">{campaign.merchant?.businessName}</p>
          </div>

          {product && (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-white/40 text-xs line-through">{formatCurrency(product.product?.originalPrice ?? 0)}</span>
                <span className="text-indigo-300 text-xl font-bold">{formatCurrency(product.salePrice)}</span>
              </div>
              <StockProgressBar remaining={product.remainingQuantity} total={product.saleQuantity} size="sm" />
              <p className="text-white/40 text-xs">{product.remainingQuantity} còn lại</p>
            </>
          )}

          {/* CTA */}
          <div onClick={(e) => e.preventDefault()}>
            {isActive && !isSoldOut && (
              isAuthenticated ? (
                <button
                  onClick={handleBuy}
                  disabled={buyLoading}
                  className="btn-primary w-full text-sm py-2 disabled:opacity-50"
                >
                  {buyLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Đang đặt...
                    </span>
                  ) : 'Mua ngay'}
                </button>
              ) : (
                <button
                  onClick={() => openAuthModal('login')}
                  className="btn-glass w-full text-sm py-2"
                >
                  Đăng nhập để mua
                </button>
              )
            )}
            {isScheduled && (
              <button
                onClick={handlePreRegister}
                disabled={regLoading}
                className="btn-glass w-full text-sm py-2 disabled:opacity-50"
              >
                {regLoading ? 'Đang đăng ký...' : 'Đăng ký nhắc nhở'}
              </button>
            )}
            {(isEnded || (isActive && isSoldOut)) && (
              <button disabled className="w-full text-sm py-2 rounded-xl bg-white/5 text-white/30 cursor-not-allowed border border-white/10">
                {isSoldOut ? 'Hết hàng' : 'Đã kết thúc'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function ActiveCountdown({ endTime }: { endTime: string }) {
  const { hours, minutes, seconds } = useCountdown(endTime)
  return (
    <div className="absolute bottom-2 left-2 glass rounded-lg px-2 py-1">
      <span className="text-white text-xs font-mono font-bold">
        Còn {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  )
}
