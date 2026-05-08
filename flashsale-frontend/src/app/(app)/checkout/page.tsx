'use client'

import { Suspense, useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Building2, Loader2 } from 'lucide-react'
import { useCheckout } from '@/hooks/mutations/useCheckout'
import { useAuthContext } from '@/contexts/auth-context'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AddressPicker } from '@/components/shared/AddressPicker'
import { formatCurrency } from '@/lib/utils'
import type { CheckoutDto } from '@/services/checkout.service'
import { useCheckoutPaymentMethods } from '@/hooks/queries/useCheckoutPaymentMethods'
import type { PaymentMethod } from '@/types'
import { useReservationDetail } from '@/hooks/queries/useReservationDetail'

// Chỉ validate các field được register() với react-hook-form
// Address (provinceId/districtId/wardCode/streetAddress) được validate riêng qua validateAddress()
const schema = z.object({
  fullName: z.string().min(1, 'Vui lòng nhập họ tên'),
  phone: z.string().regex(/^(0[3-9]\d{8})$/, 'Số điện thoại không hợp lệ'),
})

type CheckoutForm = z.infer<typeof schema>

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reservationId = searchParams.get('reservationId')
  const { user } = useAuthContext()
  const { checkout, loading } = useCheckout()
  const { data: methods, loading: methodsLoading } = useCheckoutPaymentMethods()
  const {
    data: reservation,
    loading: reservationLoading,
    error: reservationError,
    refetch: refetchReservation,
  } = useReservationDetail(reservationId)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [expiredDialog, setExpiredDialog] = useState(false)

  // Address picker state (outside react-hook-form for cascade selects)
  const [provinceId, setProvinceId] = useState<number | null>(null)
  const [provinceName, setProvinceName] = useState('')
  const [districtId, setDistrictId] = useState<number | null>(null)
  const [districtName, setDistrictName] = useState('')
  const [wardCode, setWardCode] = useState<string | null>(null)
  const [wardName, setWardName] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [addressErrors, setAddressErrors] = useState<{
    province?: string
    district?: string
    ward?: string
    streetAddress?: string
  }>({})

  useEffect(() => {
    if (!reservationId) router.replace('/campaigns')
  }, [reservationId, router])

  const defaultMethod =
    methods.find(m => m.isDefault)?.method ?? methods[0]?.method ?? null
  const effectiveSelectedMethod =
    selectedMethod && methods.some(m => m.method === selectedMethod)
      ? selectedMethod
      : defaultMethod

  const { register, handleSubmit, formState: { errors } } = useForm<CheckoutForm>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: user?.fullName ?? '' },
  })

  const validateAddress = (): boolean => {
    const errs: typeof addressErrors = {}
    if (!provinceId) errs.province = 'Vui lòng chọn tỉnh/thành phố'
    if (!districtId) errs.district = 'Vui lòng chọn quận/huyện'
    if (!wardCode) errs.ward = 'Vui lòng chọn phường/xã'
    if (!streetAddress.trim()) errs.streetAddress = 'Vui lòng nhập số nhà và tên đường'
    setAddressErrors(errs)
    return Object.keys(errs).length === 0
  }

  const onSubmit = async (formData: CheckoutForm) => {
    if (!validateAddress()) return
    if (!reservationId || !effectiveSelectedMethod || reservation?.status !== 'HOLDING') return

    const shippingAddress = JSON.stringify({
      to_name: formData.fullName,
      to_phone: formData.phone,
      to_address: streetAddress.trim(),
      to_ward_code: wardCode!,
      to_ward_name: wardName,
      to_district_id: districtId!,
      to_district_name: districtName,
      to_province_id: provinceId!,
      to_province_name: provinceName,
    })

    try {
      const { paymentUrl } = await checkout({
        reservationId,
        shippingAddress,
        paymentMethod: effectiveSelectedMethod,
        clientOrigin: window.location.origin,
      } as CheckoutDto)
      window.location.assign(paymentUrl)
    } catch { /* handled by hook */ }
  }

  if (!reservationId) return null

  if (reservationError) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={32} />
          <p className="text-white/70 text-sm mb-4">{reservationError}</p>
          <button onClick={refetchReservation} className="btn-glass text-sm px-4 py-2">Thử lại</button>
        </div>
      </div>
    )
  }

  if (!reservationLoading && reservation && reservation.status !== 'HOLDING') {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="glass rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-orange-400" size={32} />
          <h2 className="text-white font-semibold mb-2">Giữ chỗ không còn hiệu lực</h2>
          <p className="text-white/60 text-sm mb-4">
            Trạng thái hiện tại: <span className="text-white font-medium">{reservation.status}</span>
          </p>
          <button onClick={() => router.push('/campaigns')} className="btn-primary text-sm px-4 py-2">Về trang Flash Sale</button>
        </div>
      </div>
    )
  }

  const totalAmount = reservation?.totalAmount ?? 0
  const expiredAtFromQuery = searchParams.get('expiredAt')
  const targetExpiredAt = reservation?.expiredAt ?? expiredAtFromQuery

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-white text-2xl font-bold">Thanh toán</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-3 space-y-4">
          <form id="checkout-form" onSubmit={handleSubmit(onSubmit)}>
            {/* Shipping info */}
            <div className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-white font-semibold">Thông tin giao hàng</h2>
              <div className="space-y-3">
                {/* Name */}
                <div>
                  <input {...register('fullName')} placeholder="Họ và tên" className="input-glass w-full" />
                  {errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName.message}</p>}
                </div>
                {/* Phone */}
                <div>
                  <input {...register('phone')} placeholder="Số điện thoại" className="input-glass w-full" />
                  {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone.message}</p>}
                </div>

                {/* Address picker */}
                <div className="pt-1">
                  <p className="text-white/50 text-xs mb-2">Địa chỉ giao hàng</p>
                  <AddressPicker
                    provinceId={provinceId}
                    districtId={districtId}
                    wardCode={wardCode}
                    streetAddress={streetAddress}
                    onProvinceChange={(id, name) => {
                      setProvinceId(id)
                      setProvinceName(name)
                      setAddressErrors(prev => ({ ...prev, province: undefined }))
                    }}
                    onDistrictChange={(id, name) => {
                      setDistrictId(id)
                      setDistrictName(name)
                      setAddressErrors(prev => ({ ...prev, district: undefined }))
                    }}
                    onWardChange={(code, name) => {
                      setWardCode(code)
                      setWardName(name)
                      setAddressErrors(prev => ({ ...prev, ward: undefined }))
                    }}
                    onStreetAddressChange={val => {
                      setStreetAddress(val)
                      setAddressErrors(prev => ({ ...prev, streetAddress: undefined }))
                    }}
                    errors={addressErrors}
                  />
                </div>
              </div>
            </div>

            {/* Payment methods */}
            <div className="glass rounded-2xl p-6 space-y-4 mt-4">
              <h2 className="text-white font-semibold">Phương thức thanh toán</h2>
              <div className="space-y-3">
                {methodsLoading ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-16 rounded-xl bg-white/8" />
                    <div className="h-16 rounded-xl bg-white/8" />
                  </div>
                ) : methods.length === 0 ? (
                  <p className="text-sm text-red-300">
                    Hiện không có cổng thanh toán khả dụng. Vui lòng thử lại sau.
                  </p>
                ) : (
                  methods.map((method) => (
                    <button
                      key={method.method}
                      type="button"
                      onClick={() => setSelectedMethod(method.method)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                        effectiveSelectedMethod === method.method
                          ? 'border-indigo-500/60 bg-indigo-500/10'
                          : 'border-white/10 glass hover:border-white/20'
                      }`}
                    >
                      <Building2 size={24} className={effectiveSelectedMethod === method.method ? 'text-indigo-300' : 'text-white/50'} />
                      <div className="text-left">
                        <p className={`font-medium text-sm ${effectiveSelectedMethod === method.method ? 'text-indigo-300' : 'text-white'}`}>
                          {method.displayName}
                        </p>
                        <p className="text-white/40 text-xs">{method.method}</p>
                      </div>
                      {method.isDefault && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Mặc định
                        </span>
                      )}
                      <div className={`ml-auto w-4 h-4 rounded-full border-2 ${effectiveSelectedMethod === method.method ? 'border-indigo-400 bg-indigo-400' : 'border-white/30'}`} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Right: Order Summary */}
        <div className="lg:col-span-2">
          <div className="glass rounded-2xl p-6 space-y-4 lg:sticky lg:top-24">
            <h2 className="text-white font-semibold">Tóm tắt đơn hàng</h2>

            {reservationLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-20 rounded-xl bg-white/8" />
                <div className="h-4 rounded bg-white/8 w-1/2" />
              </div>
            ) : reservation ? (
              <div className="glass rounded-xl p-3 flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 relative">
                  {reservation.campaignProduct.product.imageUrl ? (
                    <Image
                      src={reservation.campaignProduct.product.imageUrl}
                      alt={reservation.campaignProduct.product.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{reservation.campaignProduct.product.name}</p>
                  <p className="text-white/50 text-xs">x{reservation.quantity} • {formatCurrency(reservation.campaignProduct.salePrice)}</p>
                </div>
              </div>
            ) : null}

            {/* Countdown */}
            <div className="glass-brand rounded-xl p-3">
              <p className="text-white/60 text-xs mb-2">Giữ chỗ hết hạn sau</p>
              {targetExpiredAt ? (
                <CountdownTimer
                  targetDate={targetExpiredAt}
                  size="sm"
                  onExpire={() => setExpiredDialog(true)}
                />
              ) : (
                <p className="text-white/60 text-sm">Đang tải thời gian giữ chỗ...</p>
              )}
            </div>

            {/* Summary rows */}
            <div className="space-y-2 py-3 border-y border-white/10">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Tạm tính</span>
                <span className="text-white">{formatCurrency(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Phí vận chuyển</span>
                <span className="text-emerald-400 font-medium">Miễn phí</span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-white font-semibold">Tổng cộng</span>
              <span className="text-indigo-300 text-xl font-bold">{formatCurrency(totalAmount)}</span>
            </div>

            <button
              type="submit"
              form="checkout-form"
              disabled={loading || methodsLoading || reservationLoading || !effectiveSelectedMethod || methods.length === 0 || reservation?.status !== 'HOLDING'}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang xử lý...
                </span>
              ) : `Hoàn tất thanh toán — ${formatCurrency(totalAmount)}`}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={expiredDialog}
        title="Giữ chỗ đã hết hạn"
        description="Thời gian giữ chỗ đã hết. Bạn cần thực hiện lại quá trình mua hàng."
        confirmLabel="Về trang Flash Sale"
        cancelLabel=""
        onConfirm={() => router.push('/campaigns')}
        onCancel={() => router.push('/campaigns')}
      />
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="glass rounded-2xl p-8 text-center text-white/60">Đang tải...</div>}>
      <CheckoutContent />
    </Suspense>
  )
}
