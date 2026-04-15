'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Shield, Upload } from 'lucide-react'
import { useAuthContext } from '@/contexts/auth-context'
import { useUpdateProfile } from '@/hooks/mutations/useUpdateProfile'
import { useLogout } from '@/hooks/mutations/useLogout'
import { formatDate } from '@/lib/utils'
import type { UserRole } from '@/types'

const schema = z.object({
  fullName: z.string().min(1, 'Vui lòng nhập họ tên'),
})

type ProfileForm = z.infer<typeof schema>

const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: 'Khách hàng',
  MERCHANT: 'Nhà bán hàng',
  ADMIN: 'Quản trị viên',
}

const ROLE_COLORS: Record<UserRole, string> = {
  CUSTOMER: 'bg-blue-500/15 text-blue-300 border border-blue-500/20',
  MERCHANT: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20',
  ADMIN: 'bg-red-500/15 text-red-300 border border-red-500/20',
}

export default function ProfilePage() {
  const { user } = useAuthContext()
  const { update, loading } = useUpdateProfile()
  const { logout, loading: logoutLoading } = useLogout()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProfileForm>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: user?.fullName ?? '' },
  })

  useEffect(() => {
    if (user) {
      reset({ fullName: user.fullName })
      setTimeout(() => setAvatarPreview(user.avatarUrl ?? null), 0)
    }
  }, [user, reset])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (!user) return (
    <div className="max-w-2xl mx-auto glass rounded-2xl p-8 text-center text-white/40">
      Chưa đăng nhập
    </div>
  )

  const initials = user.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  const onSubmit = async (data: ProfileForm) => {
    await update({ fullName: data.fullName }, pendingFile ?? undefined)
    setPendingFile(null)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-white text-2xl font-bold">Hồ sơ cá nhân</h1>

      {/* Section 1 — Avatar & Name */}
      <div className="glass rounded-2xl p-6 flex items-center gap-5">
        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <div className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
            {avatarPreview ? (
              <Image src={avatarPreview} alt={user.fullName} width={64} height={64} className="w-full h-full object-cover" unoptimized />
            ) : initials}
          </div>
          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Upload size={16} className="text-white" />
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xl font-semibold truncate">{user.fullName}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[user.role]}`}>
              {ROLE_LABELS[user.role]}
            </span>
          </div>
          <p className="text-white/40 text-sm mt-1">{user.email}</p>
          {'createdAt' in user && (
            <p className="text-white/30 text-xs mt-0.5">Thành viên từ {formatDate((user as { createdAt: string }).createdAt)}</p>
          )}
        </div>
      </div>

      {/* Section 2 — Edit form */}
      <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-2xl p-6 space-y-4" noValidate>
        <h2 className="text-white font-semibold">Chỉnh sửa thông tin</h2>
        <div>
          <label className="text-white/60 text-sm mb-1 block">Họ và tên *</label>
          <input {...register('fullName')} className="input-glass" placeholder="Nhập họ và tên" />
          {errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName.message}</p>}
        </div>
        {pendingFile && (
          <p className="text-indigo-400 text-xs">Ảnh mới đã được chọn — sẽ được lưu khi bạn bấm &ldquo;Lưu thay đổi&rdquo;.</p>
        )}
        <p className="text-white/30 text-xs">Để đổi ảnh đại diện, nhấn vào ảnh ở trên để upload từ máy tính.</p>
        <div className="flex justify-end">
          <button type="submit" disabled={loading || (!isDirty && !pendingFile)} className="btn-primary disabled:opacity-50">
            {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>

      {/* Section 3 — Account info (read-only) */}
      <div className="glass rounded-2xl p-6 space-y-3">
        <h2 className="text-white font-semibold">Thông tin tài khoản</h2>
        <div className="flex items-center gap-3 py-2 border-b border-white/10">
          <Lock size={16} className="text-white/40 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-white/40 text-xs">Email</p>
            <p className="text-white text-sm">{user.email}</p>
          </div>
          <span className="text-white/30 text-xs">Không thể thay đổi</span>
        </div>
        <div className="flex items-center gap-3 py-2 border-b border-white/10">
          <Shield size={16} className="text-white/40 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-white/40 text-xs">Vai trò</p>
            <p className="text-white text-sm">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 py-2">
          <div className="w-4 h-4 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-white/40 text-xs">Trạng thái</p>
            {/* User account status — show "Đang hoạt động", not the campaign "Đang diễn ra" */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-500/15 border-emerald-500/30 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Đang hoạt động
            </span>
          </div>
        </div>
      </div>

      {/* Section 5 — Danger zone */}
      <div className="glass rounded-2xl p-6 space-y-3 border border-red-500/20">
        <h2 className="text-white font-semibold">Vùng nguy hiểm</h2>
        <button
          onClick={logout}
          disabled={logoutLoading}
          className="bg-white/8 border border-red-500/30 text-red-300 rounded-xl px-6 py-3 hover:bg-red-500/10 transition-all disabled:opacity-50"
        >
          {logoutLoading ? 'Đang đăng xuất...' : 'Đăng xuất'}
        </button>
      </div>
    </div>
  )
}
