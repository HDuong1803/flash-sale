'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Store, Loader2 } from 'lucide-react'
import { useAuthContext } from '@/contexts/auth-context'
import { useUiContext } from '@/contexts/ui-context'
import { useCountdown } from '@/hooks/useCountdown'
import { usePurchase } from '@/hooks/mutations/usePurchase'
import { usePreRegister } from '@/hooks/mutations/usePreRegister'
import { useCancelPreRegister } from '@/hooks/mutations/useCancelPreRegister'
import { useMerchantProfile } from '@/hooks/queries/useMerchantProfile'
import { StockProgressBar } from '@/components/shared/StockProgressBar'
import { formatCurrency, calculateDiscount } from '@/lib/utils'
import type { Campaign, CampaignProduct } from '@/types'
import { useRouter } from 'next/navigation'

interface CampaignCardProps {
  campaign: Campaign
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthContext()
  const { openAuthModal } = useUiContext()
  const merchantProfile = useMerchantProfile()
  // Chỉ block nếu đây là campaign của chính merchant đang đăng nhập
  const isOwnCampaign = user?.role === 'MERCHANT' && !!merchantProfile?.id && merchantProfile.id === campaign.merchantId
  const { purchase, loading: buyLoading } = usePurchase()
  const { preRegister, loading: regLoading } = usePreRegister()
  const { cancelPreRegister, loading: cancelLoading } = useCancelPreRegister()
  const [preRegisteredOverride, setPreRegisteredOverride] = useState<boolean | null>(null)
  const [preRegisterHovered, setPreRegisterHovered] = useState(false)

  // Use first product for display
  const product = campaign.campaignProducts?.[0] as CampaignProduct | undefined
  const isScheduled = campaign.status === 'SCHEDULED'
  const displayRemaining =
    product && isScheduled && product.remainingQuantity === 0 && product.saleQuantity > 0
      ? product.saleQuantity
      : (product?.remainingQuantity ?? 0)
  const discount = product ? calculateDiscount(product.product?.originalPrice ?? 0, product.salePrice) : 0
  const isSoldOut = campaign.status === 'ACTIVE' ? (displayRemaining <= 0) : false
  const isActive = campaign.status === 'ACTIVE'
  const isEnded = campaign.status === 'ENDED'
  const isPreRegistered =
    preRegisteredOverride !== null
      ? preRegisteredOverride
      : (campaign.isPreRegistered ?? false)

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
    try {
      await preRegister(campaign.id)
      setPreRegisteredOverride(true)
    } catch { /* toast shown */ }
  }

  const handleCancelPreRegister = async () => {
    if (!isAuthenticated) { openAuthModal('login'); return }
    try {
      await cancelPreRegister(campaign.id)
      setPreRegisteredOverride(false)
    } catch { /* toast shown */ }
  }

  // Merchant click vào campaign của mình → trang quản lý, không phải customer detail
  const campaignHref = isOwnCampaign
    ? `/merchant/campaigns/${campaign.id}`
    : `/campaigns/${campaign.id}`

  return (
    <Link href={campaignHref} className="group block">
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
              <span className="text-white text-xs font-bold">ĐANG DIỄN RA</span>
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
              <StockProgressBar remaining={displayRemaining} total={product.saleQuantity} size="sm" />
              <p className="text-white/40 text-xs">{displayRemaining} còn lại</p>
            </>
          )}

          {/* CTA */}
          <div onClick={(e) => e.preventDefault()}>
            {isOwnCampaign ? (
              /* Campaign của chính merchant — không cho mua */
              <div className="w-full text-xs text-white/30 text-center py-2 rounded-xl border border-white/8 bg-white/[0.03]">
                Chiến dịch của bạn
              </div>
            ) : (
              <>
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
                    onClick={isPreRegistered ? handleCancelPreRegister : handlePreRegister}
                    onMouseEnter={() => setPreRegisterHovered(true)}
                    onMouseLeave={() => setPreRegisterHovered(false)}
                    onBlur={() => setPreRegisterHovered(false)}
                    disabled={regLoading || cancelLoading}
                    className={[
                      'w-full text-sm py-2 rounded-xl border transition-colors disabled:opacity-50',
                      isPreRegistered
                        ? (preRegisterHovered
                            ? 'bg-red-500/10 text-red-300 border-red-400/60 hover:bg-red-500/20'
                            : 'bg-indigo-500/10 text-indigo-200 border-indigo-400/50 hover:bg-indigo-500/20')
                        : 'btn-glass',
                    ].join(' ')}
                  >
                    {regLoading
                      ? 'Đang đăng ký...'
                      : cancelLoading
                        ? 'Đang huỷ...'
                        : isPreRegistered
                          ? (preRegisterHovered ? 'Huỷ đăng ký' : 'Đã đăng ký nhắc nhở')
                          : 'Đăng ký nhắc nhở'}
                  </button>
                )}
                {(isEnded || (isActive && isSoldOut)) && (
                  <button disabled className="w-full text-sm py-2 rounded-xl bg-white/5 text-white/30 cursor-not-allowed border border-white/10">
                    {isSoldOut ? 'Hết hàng' : 'Đã kết thúc'}
                  </button>
                )}
              </>
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
