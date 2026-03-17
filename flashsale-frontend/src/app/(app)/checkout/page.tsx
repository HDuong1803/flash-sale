'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CreditCard, Smartphone, Globe, Loader2 } from 'lucide-react'
import { useCheckout } from '@/hooks/mutations/useCheckout'
import { useAuthStore } from '@/stores/auth.store'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { formatCurrency } from '@/lib/utils'
import type { CheckoutDto } from '@/services/checkout.service'

const PROVINCES = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'An Giang', 'Bình Dương', 'Đồng Nai', 'Khánh Hòa', 'Lâm Đồng']

const schema = z.object({
  fullName: z.string().min(1, 'Vui lòng nhập họ tên'),
  phone: z.string().regex(/^(0[3-9]\d{8})$/, 'Số điện thoại không hợp lệ'),
  address: z.string().min(5, 'Vui lòng nhập địa chỉ'),
  city: z.string().min(1, 'Vui lòng chọn tỉnh/thành phố'),
})

type CheckoutForm = z.infer<typeof schema>

const PAYMENT_METHODS = [
  { id: 'VNPAY' as const, icon: CreditCard, title: 'Thanh toán VNPay', subtitle: 'ATM nội địa' },
  { id: 'MOMO' as const, icon: Smartphone, title: 'Ví MoMo', subtitle: '' },
  { id: 'STRIPE' as const, icon: Globe, title: 'Thẻ quốc tế', subtitle: 'Visa/Mastercard' },
]

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reservationId = searchParams.get('reservationId')
  const { user } = useAuthStore()
  const { checkout, loading } = useCheckout()
  const [selectedMethod, setSelectedMethod] = useState<'VNPAY' | 'MOMO' | 'STRIPE'>('VNPAY')
  const [expiredDialog, setExpiredDialog] = useState(false)
  const [amount, setAmount] = useState(0)
  const [expiredAt, setExpiredAt] = useState<string | null>(null)

  useEffect(() => {
    if (!reservationId) router.replace('/campaigns')
  }, [reservationId, router])

  useEffect(() => {
    const expiredAtParam = searchParams.get('expiredAt')
    const amountParam = searchParams.get('amount')
    if (expiredAtParam) setExpiredAt(expiredAtParam)
    if (amountParam) setAmount(Number(amountParam))
  }, [searchParams])

  const { register, handleSubmit, formState: { errors } } = useForm<CheckoutForm>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: user?.fullName ?? '' },
  })

  const onSubmit = async (formData: CheckoutForm) => {
    if (!reservationId) return
    try {
      const { paymentUrl } = await checkout({
        reservationId,
        shippingAddress: `${formData.address}, ${formData.city}`,
        paymentMethod: selectedMethod,
      } as CheckoutDto)
      window.location.href = paymentUrl
    } catch { /* handled by hook */ }
  }

  if (!reservationId) return null

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
                <div>
                  <input {...register('fullName')} placeholder="Họ và tên" className="input-glass" />
                  {errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName.message}</p>}
                </div>
                <div>
                  <input {...register('phone')} placeholder="Số điện thoại" className="input-glass" />
                  {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone.message}</p>}
                </div>
                <div>
                  <input {...register('address')} placeholder="Địa chỉ" className="input-glass" />
                  {errors.address && <p className="text-red-400 text-xs mt-1">{errors.address.message}</p>}
                </div>
                <div>
                  <select {...register('city')} defaultValue="" className="input-glass">
                    <option value="" disabled>Chọn tỉnh/thành phố</option>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {errors.city && <p className="text-red-400 text-xs mt-1">{errors.city.message}</p>}
                </div>
              </div>
            </div>

            {/* Payment methods */}
            <div className="glass rounded-2xl p-6 space-y-4 mt-4">
              <h2 className="text-white font-semibold">Phương thức thanh toán</h2>
              <div className="space-y-3">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setSelectedMethod(method.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                      selectedMethod === method.id
                        ? 'border-indigo-500/60 bg-indigo-500/10'
                        : 'border-white/10 glass hover:border-white/20'
                    }`}
                  >
                    <method.icon size={24} className={selectedMethod === method.id ? 'text-indigo-300' : 'text-white/50'} />
                    <div className="text-left">
                      <p className={`font-medium text-sm ${selectedMethod === method.id ? 'text-indigo-300' : 'text-white'}`}>
                        {method.title}
                      </p>
                      {method.subtitle && <p className="text-white/40 text-xs">{method.subtitle}</p>}
                    </div>
                    <div className={`ml-auto w-4 h-4 rounded-full border-2 ${selectedMethod === method.id ? 'border-indigo-400 bg-indigo-400' : 'border-white/30'}`} />
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>

        {/* Right: Order Summary */}
        <div className="lg:col-span-2">
          <div className="glass rounded-2xl p-6 space-y-4 lg:sticky lg:top-24">
            <h2 className="text-white font-semibold">Tóm tắt đơn hàng</h2>

            {/* Countdown */}
            <div className="glass-brand rounded-xl p-3">
              <p className="text-white/60 text-xs mb-2">Reservation hết hạn sau</p>
              <CountdownTimer
                targetDate={expiredAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString()}
                size="sm"
                onExpire={() => setExpiredDialog(true)}
              />
            </div>

            {/* Summary rows */}
            <div className="space-y-2 py-3 border-y border-white/10">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Tạm tính</span>
                <span className="text-white">{formatCurrency(amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Phí vận chuyển</span>
                <span className="text-emerald-400 font-medium">Miễn phí</span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-white font-semibold">Tổng cộng</span>
              <span className="text-indigo-300 text-xl font-bold">{formatCurrency(amount)}</span>
            </div>

            <button
              type="submit"
              form="checkout-form"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang xử lý...
                </span>
              ) : `Hoàn tất thanh toán — ${formatCurrency(amount)}`}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={expiredDialog}
        title="Reservation đã hết hạn"
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
