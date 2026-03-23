'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Clock, XCircle, Zap, BarChart3, Users, Loader2 } from 'lucide-react'
import { useApplyMerchant } from '@/hooks/mutations/useApplyMerchant'
import { useApplicationStatus } from '@/hooks/queries/useApplicationStatus'
import { useAuthContext } from '@/contexts/auth-context'

const schema = z.object({
  businessName: z.string().min(2, 'Tối thiểu 2 ký tự'),
  taxCode: z.string().regex(/^\d{10,13}$/, 'Mã số thuế gồm 10-13 chữ số'),
  description: z.string().max(300, 'Tối đa 300 ký tự').optional(),
  phone: z.string().regex(/^(0[3-9]\d{8})$/, 'Số điện thoại không hợp lệ'),
  address: z.string().min(5, 'Vui lòng nhập địa chỉ'),
})

type ApplyForm = z.infer<typeof schema>

const BENEFITS = [
  { icon: Users, label: 'Tiếp cận triệu khách' },
  { icon: Zap, label: 'Tạo Flash Sale dễ dàng' },
  { icon: BarChart3, label: 'Dashboard thời gian thực' },
]

export default function MerchantApplyPage() {
  const router = useRouter()
  const { user, merchantApplicationStatus, setMerchantApplicationStatus } = useAuthContext()
  const { mutate: apply, loading } = useApplyMerchant()
  const { data: appStatus, loading: statusLoading } = useApplicationStatus()
  const [submitted, setSubmitted] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (user?.role === 'MERCHANT') router.replace('/merchant/dashboard')
  }, [user, router])

  useEffect(() => {
    if (appStatus?.status === 'APPROVED') router.replace('/merchant/dashboard')
  }, [appStatus, router])

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ApplyForm>({
    resolver: zodResolver(schema),
  })
  const description = watch('description', '')

  const onSubmit = async (data: ApplyForm) => {
    try {
      await apply({ ...data, description: data.description ?? '' })
      setMerchantApplicationStatus('PENDING')
      setSubmitted(true)
    } catch { /* toast shown */ }
  }

  if (statusLoading) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="glass rounded-2xl p-8 animate-pulse">
          <div className="bg-white/8 h-8 w-1/2 rounded-lg mb-4 mx-auto" />
          <div className="bg-white/8 h-4 w-3/4 rounded-lg mx-auto" />
        </div>
      </div>
    )
  }

  const currentStatus = submitted ? 'PENDING' : appStatus?.status
  const isPending = currentStatus === 'PENDING' || merchantApplicationStatus === 'PENDING'
  const isRejected = currentStatus === 'REJECTED' && !submitted

  if (isPending) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="glass rounded-2xl p-8 text-center space-y-4">
          <Clock size={48} className="mx-auto text-yellow-400" />
          <div>
            <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs font-semibold px-3 py-1 rounded-full">ĐANG XÉT DUYỆT</span>
          </div>
          <h2 className="text-white text-xl font-bold">Đơn đang được xét duyệt</h2>
          <p className="text-white/50 text-sm">Thường trong 24 giờ làm việc. Chúng tôi sẽ thông báo kết quả qua email.</p>
        </div>
      </div>
    )
  }

  if (isRejected) {
    return (
      <div className="max-w-lg mx-auto mt-12 space-y-4">
        <div className="glass rounded-2xl p-6 text-center space-y-3">
          <XCircle size={40} className="mx-auto text-red-400" />
          <span className="bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-semibold px-3 py-1 rounded-full">BỊ TỪ CHỐI</span>
          <h2 className="text-white font-bold text-lg">Đơn đăng ký bị từ chối</h2>
          {appStatus?.rejectionReason && (
            <div className="glass rounded-xl p-3 text-left">
              <p className="text-white/40 text-xs mb-1">Lý do:</p>
              <p className="text-white/70 text-sm">{appStatus.rejectionReason}</p>
            </div>
          )}
          <button onClick={() => setShowForm(true)} className="btn-primary">Nộp lại đơn</button>
        </div>
      </div>
    )
  }

  if (!showForm && !appStatus) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="glass-brand rounded-2xl p-8 text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
            <Store size={36} className="text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Trở thành Merchant trên FlashSale</h1>
          <p className="text-white/60 text-sm">Tiếp cận hàng triệu khách hàng và tăng doanh số với Flash Sale</p>
          <div className="flex flex-wrap justify-center gap-3">
            {BENEFITS.map((b) => (
              <div key={b.label} className="flex items-center gap-2 glass rounded-full px-4 py-2">
                <b.icon size={14} className="text-indigo-400" />
                <span className="text-white/80 text-sm">{b.label}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary px-8">Đăng ký ngay</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="glass-brand rounded-2xl p-6 text-center">
        <Store size={36} className="mx-auto text-indigo-400 mb-2" />
        <h1 className="text-white text-xl font-bold">Đăng ký Merchant</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-2xl p-6 space-y-4" noValidate>
        <div>
          <label className="text-white/60 text-sm mb-1 block">Tên doanh nghiệp *</label>
          <input {...register('businessName')} className="input-glass" placeholder="Công ty TNHH ABC" />
          {errors.businessName && <p className="text-red-400 text-xs mt-1">{errors.businessName.message}</p>}
        </div>
        <div>
          <label className="text-white/60 text-sm mb-1 block">Mã số thuế *</label>
          <input {...register('taxCode')} className="input-glass" placeholder="0123456789" />
          {errors.taxCode && <p className="text-red-400 text-xs mt-1">{errors.taxCode.message}</p>}
        </div>
        <div>
          <label className="text-white/60 text-sm mb-1 block">
            Mô tả ngắn <span className="text-white/30">({(description ?? '').length}/300)</span>
          </label>
          <textarea {...register('description')} className="input-glass resize-y min-h-[80px] max-h-[150px]" rows={3} placeholder="Mô tả về doanh nghiệp của bạn..." maxLength={300} />
          {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>}
        </div>
        <div>
          <label className="text-white/60 text-sm mb-1 block">Số điện thoại *</label>
          <input {...register('phone')} className="input-glass" placeholder="0901234567" />
          {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone.message}</p>}
        </div>
        <div>
          <label className="text-white/60 text-sm mb-1 block">Địa chỉ kinh doanh *</label>
          <input {...register('address')} className="input-glass" placeholder="123 Nguyễn Huệ, Quận 1, TP.HCM" />
          {errors.address && <p className="text-red-400 text-xs mt-1">{errors.address.message}</p>}
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang gửi...
            </span>
          ) : 'Gửi đơn đăng ký'}
        </button>
      </form>
    </div>
  )
}
