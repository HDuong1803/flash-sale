'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock, Eye, EyeOff, User, Loader2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useUiStore } from '@/stores/ui.store'
import { useLogin } from '@/hooks/mutations/useLogin'
import { useRegister } from '@/hooks/mutations/useRegister'
import { useGoogleAuth } from '@/hooks/useGoogleAuth'
import { cn } from '@/lib/utils'

// ---- Schemas ----
const loginSchema = z.object({
  email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  remember: z.boolean().optional(),
})

const registerSchema = z.object({
  fullName: z.string().min(1, 'Vui lòng nhập họ tên'),
  email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
  password: z.string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .regex(/\d/, 'Mật khẩu phải có ít nhất 1 số'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Mật khẩu không khớp',
  path: ['confirmPassword'],
})

type LoginForm = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

// ---- Google Button ----
function GoogleButton({ onClick, loading, text }: { onClick: () => void; loading: boolean; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 bg-white/8 border border-white/20 rounded-xl py-3 text-white text-sm font-medium hover:bg-white/14 transition-all disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
          <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04c-.72.48-1.63.77-2.7.77-2.08 0-3.84-1.4-4.47-3.29H1.83v2.07A8 8 0 0 0 8.98 17z"/>
          <path fill="#FBBC05" d="M4.51 10.5A4.8 4.8 0 0 1 4.26 9c0-.52.09-1.02.25-1.5V5.43H1.83A8 8 0 0 0 .98 9c0 .93.19 1.8.85 2.57z"/>
          <path fill="#EA4335" d="M8.98 3.58c1.16 0 2.2.4 3.02 1.19l2.27-2.27A8 8 0 0 0 1.83 5.43L4.51 7.5c.63-1.9 2.39-3.92 4.47-3.92z"/>
        </svg>
      )}
      {text}
    </button>
  )
}

// ---- Password Strength ----
function PasswordStrength({ password }: { password: string }) {
  const strength = !password ? 0
    : password.length < 6 ? 1
    : password.length < 8 || !/\d/.test(password) ? 2
    : password.length >= 10 && /[A-Z]/.test(password) && /[^a-zA-Z0-9]/.test(password) ? 4
    : 3

  const labels = ['', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh']
  const colors = ['', 'bg-red-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-emerald-400']

  if (!password) return null
  return (
    <div className="mt-1.5">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('h-1 flex-1 rounded-full transition-all', i <= strength ? colors[strength] : 'bg-white/15')} />
        ))}
      </div>
      <p className={cn('text-xs', strength <= 1 ? 'text-red-400' : strength === 2 ? 'text-yellow-400' : 'text-emerald-400')}>
        {labels[strength]}
      </p>
    </div>
  )
}

// ---- Login Form ----
function LoginForm({ onSwitchTab }: { onSwitchTab: () => void }) {
  const { login, loading } = useLogin()
  const { signIn, loading: googleLoading } = useGoogleAuth()
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    try { await login(data.email, data.password) } catch { /* toast shown in hook */ }
  }

  return (
    <div className="space-y-4">
      <GoogleButton
        onClick={signIn}
        loading={googleLoading}
        text="Tiếp tục với Google"
      />

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/15" />
        <span className="text-white/30 text-xs">hoặc</span>
        <div className="flex-1 h-px bg-white/15" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              {...register('email')}
              type="email"
              placeholder="Email"
              className="input-glass pl-9"
            />
          </div>
          {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="Mật khẩu"
              className="input-glass pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
        </div>

        <div className="flex items-center gap-2">
          <input
            {...register('remember')}
            type="checkbox"
            id="remember"
            className="w-4 h-4 rounded border-white/20 bg-white/10 accent-indigo-500"
          />
          <label htmlFor="remember" className="text-white/50 text-sm cursor-pointer">Ghi nhớ đăng nhập</label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang đăng nhập...
            </span>
          ) : 'Đăng nhập'}
        </button>
      </form>

      <p className="text-center text-white/40 text-sm">
        Chưa có tài khoản?{' '}
        <button onClick={onSwitchTab} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
          Đăng ký ngay
        </button>
      </p>
    </div>
  )
}

// ---- Register Form ----
function RegisterForm({ onSwitchTab }: { onSwitchTab: () => void }) {
  const { register: registerUser, loading } = useRegister()
  const { signIn, loading: googleLoading } = useGoogleAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  const password = watch('password', '')

  const onSubmit = async (data: RegisterForm) => {
    try {
      await registerUser({ fullName: data.fullName, email: data.email, password: data.password })
    } catch { /* toast shown in hook */ }
  }

  return (
    <div className="space-y-4">
      <GoogleButton
        onClick={signIn}
        loading={googleLoading}
        text="Đăng ký với Google"
      />

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/15" />
        <span className="text-white/30 text-xs">hoặc</span>
        <div className="flex-1 h-px bg-white/15" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              {...register('fullName')}
              type="text"
              placeholder="Họ và tên"
              className="input-glass pl-9"
            />
          </div>
          {errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName.message}</p>}
        </div>

        <div>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              {...register('email')}
              type="email"
              placeholder="Email"
              className="input-glass pl-9"
            />
          </div>
          {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="Mật khẩu (tối thiểu 8 ký tự)"
              className="input-glass pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
          <PasswordStrength password={password} />
        </div>

        <div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              {...register('confirmPassword')}
              type={showConfirm ? 'text' : 'password'}
              placeholder="Xác nhận mật khẩu"
              className="input-glass pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword.message}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang tạo tài khoản...
            </span>
          ) : 'Tạo tài khoản'}
        </button>
      </form>

      <p className="text-center text-white/30 text-xs">
        Bằng cách đăng ký, bạn đồng ý với Điều khoản dịch vụ
      </p>
      <p className="text-center text-white/40 text-sm">
        Đã có tài khoản?{' '}
        <button onClick={onSwitchTab} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
          Đăng nhập
        </button>
      </p>
    </div>
  )
}

// ---- Main AuthModal ----
export function AuthModal() {
  const { authModalOpen, authModalTab, closeAuthModal, openAuthModal } = useUiStore()

  return (
    <Dialog open={authModalOpen} onOpenChange={(open) => !open && closeAuthModal()}>
      <DialogContent
        className="rounded-2xl max-w-md p-0 overflow-hidden"
        style={{
          background: 'rgba(8,7,26,0.96)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        }}
      >
        <div className="p-6 overflow-y-auto max-h-[85vh]">
          {/* Tabs */}
          <div className="flex rounded-xl bg-white/5 p-1 mb-6">
            {(['login', 'register'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => openAuthModal(tab)}
                className={cn(
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                  authModalTab === tab
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-white/40 hover:text-white/70'
                )}
              >
                {tab === 'login' ? 'Đăng nhập' : 'Đăng ký'}
              </button>
            ))}
          </div>

          {authModalTab === 'login' ? (
            <LoginForm onSwitchTab={() => openAuthModal('register')} />
          ) : (
            <RegisterForm onSwitchTab={() => openAuthModal('login')} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
