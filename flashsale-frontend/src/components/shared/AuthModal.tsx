'use client'

import { useRef, useState, useEffect, useCallback, KeyboardEvent, ClipboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock, Eye, EyeOff, User, Loader2, ArrowLeft, RefreshCw, KeyRound } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useUiContext } from '@/contexts/ui-context'
import { useLogin } from '@/hooks/mutations/useLogin'
import { useRegister } from '@/hooks/mutations/useRegister'
import { useVerifyOtp } from '@/hooks/mutations/useVerifyOtp'
import { useResendOtp } from '@/hooks/mutations/useResendOtp'
import { useForgotPassword } from '@/hooks/mutations/useForgotPassword'
import { useResetPassword } from '@/hooks/mutations/useResetPassword'
import { useGoogleAuth } from '@/hooks/useGoogleAuth'
import { ApiError } from '@/lib/api-client'
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

const forgotSchema = z.object({
  email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
})

const newPasswordSchema = z.object({
  newPassword: z.string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .regex(/\d/, 'Mật khẩu phải có ít nhất 1 số'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Mật khẩu không khớp',
  path: ['confirmPassword'],
})

type LoginForm = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>
type ForgotForm = z.infer<typeof forgotSchema>
type NewPasswordForm = z.infer<typeof newPasswordSchema>

// ---- View state ----
type ModalView = 'tabs' | 'verify-otp' | 'forgot' | 'reset-otp' | 'new-password'

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

// ---- OTP Input Box (shared) ----
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}@${domain}`
}

const OTP_TOTAL_SECONDS = 10 * 60
const RESEND_COOLDOWN_SECONDS = 60

interface OtpBoxesProps {
  digits: string[]
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  disabled: boolean
  onChange: (index: number, value: string) => void
  onKeyDown: (index: number, e: KeyboardEvent<HTMLInputElement>) => void
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => void
}

function OtpBoxes({ digits, inputRefs, disabled, onChange, onKeyDown, onPaste }: OtpBoxesProps) {
  return (
    <div className="flex gap-2 justify-center">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => onChange(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={i === 0 ? onPaste : undefined}
          onFocus={(e) => e.target.select()}
          className={cn(
            'w-10 h-12 text-center text-xl font-bold rounded-lg border bg-white/8 text-white transition-all outline-none',
            'focus:border-indigo-400 focus:bg-white/12 focus:ring-2 focus:ring-indigo-500/25',
            digit ? 'border-indigo-500/40' : 'border-white/20',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          autoFocus={i === 0}
        />
      ))}
    </div>
  )
}

// ---- Registration OTP Form ----
function OtpForm({ email, onBack }: { email: string; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(OTP_TOTAL_SECONDS)
  const [resendSecondsLeft, setResendSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS)
  const [otpError, setOtpError] = useState<string | null>(null)
  const { verifyOtp, loading: verifying } = useVerifyOtp()
  const { resendOtp, loading: resending } = useResendOtp()

  useEffect(() => {
    if (otpSecondsLeft <= 0) return
    const id = setInterval(() => setOtpSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [otpSecondsLeft])

  useEffect(() => {
    if (resendSecondsLeft <= 0) return
    const id = setInterval(() => setResendSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [resendSecondsLeft])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const otpValue = digits.join('')
  const canSubmit = otpValue.length === 6 && otpSecondsLeft > 0
  const otpExpired = otpSecondsLeft <= 0
  const canResend = resendSecondsLeft <= 0

  const focusInput = useCallback((index: number) => {
    inputRefs.current[index]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    if (otpError) setOtpError(null)
    if (digit && index < 5) focusInput(index + 1)
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const newDigits = [...digits]
        newDigits[index] = ''
        setDigits(newDigits)
      } else if (index > 0) {
        focusInput(index - 1)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusInput(index - 1)
    } else if (e.key === 'ArrowRight' && index < 5) {
      focusInput(index + 1)
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigits(pasted.split(''))
      if (otpError) setOtpError(null)
      focusInput(5)
    }
  }

  const handleSubmit = async () => {
    try {
      await verifyOtp(email, otpValue)
    } catch (err) {
      setDigits(Array(6).fill(''))
      setOtpError(err instanceof ApiError ? err.message : 'Mã OTP không đúng. Vui lòng thử lại.')
      setTimeout(() => focusInput(0), 50)
    }
  }

  const handleResend = async () => {
    try {
      await resendOtp(email)
      setOtpSecondsLeft(OTP_TOTAL_SECONDS)
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS)
      setDigits(Array(6).fill(''))
      setOtpError(null)
      setTimeout(() => focusInput(0), 50)
    } catch {
      // toast shown in hook
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center mx-auto">
          <Mail size={22} className="text-indigo-400" />
        </div>
        <h3 className="text-white font-semibold text-lg">Xác minh email</h3>
        <p className="text-white/50 text-sm leading-relaxed">
          Chúng tôi đã gửi mã OTP đến<br />
          <span className="text-indigo-300 font-medium">{maskEmail(email)}</span>
        </p>
      </div>

      <div className={cn(
        'text-center text-sm font-mono font-semibold',
        otpExpired ? 'text-red-400' : otpSecondsLeft < 60 ? 'text-yellow-400' : 'text-white/60'
      )}>
        {otpExpired ? 'Mã OTP đã hết hạn' : `Mã hết hạn sau ${formatTime(otpSecondsLeft)}`}
      </div>

      <OtpBoxes
        digits={digits}
        inputRefs={inputRefs}
        disabled={otpExpired || verifying}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />

      {otpError && (
        <div className="text-center text-sm text-red-400/90 bg-red-500/8 border border-red-500/20 rounded-lg px-4 py-2.5">
          {otpError}
        </div>
      )}

      {otpExpired && !otpError && (
        <div className="text-center text-sm text-red-400/90 bg-red-500/8 border border-red-500/20 rounded-lg px-4 py-2.5">
          Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.
        </div>
      )}

      {!otpExpired && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || verifying}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {verifying ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang xác minh...
            </span>
          ) : 'Xác nhận'}
        </button>
      )}

      <div className="text-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={!canResend || resending}
          className={cn(
            'text-sm flex items-center justify-center gap-1.5 mx-auto transition-all',
            canResend && !resending
              ? 'text-indigo-400 hover:text-indigo-300 cursor-pointer'
              : 'text-white/30 cursor-not-allowed'
          )}
        >
          {resending ? (
            <><Loader2 size={13} className="animate-spin" /> Đang gửi...</>
          ) : canResend ? (
            <><RefreshCw size={13} /> Gửi lại mã</>
          ) : (
            `Gửi lại sau ${resendSecondsLeft}s`
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="w-full flex items-center justify-center gap-1.5 text-white/40 hover:text-white/70 text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        Quay lại
      </button>
    </div>
  )
}

// ---- Forgot Password — Step 1: Email input ----
function ForgotPasswordForm({ onNext, onBack }: { onNext: (email: string) => void; onBack: () => void }) {
  const { forgotPassword, loading } = useForgotPassword()

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  })

  const onSubmit = async (data: ForgotForm) => {
    try {
      await forgotPassword(data.email)
      onNext(data.email)
    } catch {
      // toast shown in hook
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center mx-auto">
          <KeyRound size={22} className="text-violet-400" />
        </div>
        <h3 className="text-white font-semibold text-lg">Quên mật khẩu</h3>
        <p className="text-white/50 text-sm leading-relaxed">
          Nhập email tài khoản để nhận mã OTP đặt lại mật khẩu.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              {...register('email')}
              type="email"
              placeholder="Email"
              autoFocus
              className="input-glass pl-9"
            />
          </div>
          {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang gửi...
            </span>
          ) : 'Gửi mã OTP'}
        </button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="w-full flex items-center justify-center gap-1.5 text-white/40 hover:text-white/70 text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        Quay lại đăng nhập
      </button>
    </div>
  )
}

// ---- Forgot Password — Step 2: OTP input ----
function ResetOtpForm({ email, onNext, onBack }: { email: string; onNext: (otp: string) => void; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(OTP_TOTAL_SECONDS)
  const [resendSecondsLeft, setResendSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS)
  const [otpError, setOtpError] = useState<string | null>(null)
  const { forgotPassword, loading: resending } = useForgotPassword()

  useEffect(() => {
    if (otpSecondsLeft <= 0) return
    const id = setInterval(() => setOtpSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [otpSecondsLeft])

  useEffect(() => {
    if (resendSecondsLeft <= 0) return
    const id = setInterval(() => setResendSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [resendSecondsLeft])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const otpValue = digits.join('')
  const canSubmit = otpValue.length === 6 && otpSecondsLeft > 0
  const otpExpired = otpSecondsLeft <= 0
  const canResend = resendSecondsLeft <= 0

  const focusInput = useCallback((index: number) => {
    inputRefs.current[index]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    if (otpError) setOtpError(null)
    if (digit && index < 5) focusInput(index + 1)
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const newDigits = [...digits]
        newDigits[index] = ''
        setDigits(newDigits)
      } else if (index > 0) {
        focusInput(index - 1)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusInput(index - 1)
    } else if (e.key === 'ArrowRight' && index < 5) {
      focusInput(index + 1)
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigits(pasted.split(''))
      if (otpError) setOtpError(null)
      focusInput(5)
    }
  }

  const handleResend = async () => {
    try {
      await forgotPassword(email)
      setOtpSecondsLeft(OTP_TOTAL_SECONDS)
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS)
      setDigits(Array(6).fill(''))
      setOtpError(null)
      setTimeout(() => focusInput(0), 50)
    } catch {
      // toast shown in hook
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center mx-auto">
          <Mail size={22} className="text-violet-400" />
        </div>
        <h3 className="text-white font-semibold text-lg">Nhập mã OTP</h3>
        <p className="text-white/50 text-sm leading-relaxed">
          Mã đặt lại mật khẩu đã được gửi đến<br />
          <span className="text-violet-300 font-medium">{maskEmail(email)}</span>
        </p>
        <p className="text-white/30 text-xs">Kiểm tra cả thư mục spam nếu không thấy email.</p>
      </div>

      <div className={cn(
        'text-center text-sm font-mono font-semibold',
        otpExpired ? 'text-red-400' : otpSecondsLeft < 60 ? 'text-yellow-400' : 'text-white/60'
      )}>
        {otpExpired ? 'Mã OTP đã hết hạn' : `Mã hết hạn sau ${formatTime(otpSecondsLeft)}`}
      </div>

      <OtpBoxes
        digits={digits}
        inputRefs={inputRefs}
        disabled={otpExpired}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />

      {otpError && (
        <div className="text-center text-sm text-red-400/90 bg-red-500/8 border border-red-500/20 rounded-lg px-4 py-2.5">
          {otpError}
        </div>
      )}

      {otpExpired && !otpError && (
        <div className="text-center text-sm text-red-400/90 bg-red-500/8 border border-red-500/20 rounded-lg px-4 py-2.5">
          Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.
        </div>
      )}

      {!otpExpired && (
        <button
          type="button"
          onClick={() => onNext(otpValue)}
          disabled={!canSubmit}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Tiếp tục
        </button>
      )}

      <div className="text-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={!canResend || resending}
          className={cn(
            'text-sm flex items-center justify-center gap-1.5 mx-auto transition-all',
            canResend && !resending
              ? 'text-violet-400 hover:text-violet-300 cursor-pointer'
              : 'text-white/30 cursor-not-allowed'
          )}
        >
          {resending ? (
            <><Loader2 size={13} className="animate-spin" /> Đang gửi...</>
          ) : canResend ? (
            <><RefreshCw size={13} /> Gửi lại mã</>
          ) : (
            `Gửi lại sau ${resendSecondsLeft}s`
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="w-full flex items-center justify-center gap-1.5 text-white/40 hover:text-white/70 text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        Quay lại
      </button>
    </div>
  )
}

// ---- Forgot Password — Step 3: New password input ----
function NewPasswordForm({
  email,
  otp,
  onSuccess,
  onBack,
  onOtpError,
}: {
  email: string
  otp: string
  onSuccess: () => void
  onBack: () => void
  onOtpError: () => void
}) {
  const { resetPassword, loading } = useResetPassword()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<NewPasswordForm>({
    resolver: zodResolver(newPasswordSchema),
  })

  const newPassword = watch('newPassword', '')

  const onSubmit = async (data: NewPasswordForm) => {
    try {
      await resetPassword(email, otp, data.newPassword)
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 400 || err.statusCode === 404)) {
        onOtpError()
        return
      }
      // toast shown in hook for other errors
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center mx-auto">
          <Lock size={22} className="text-violet-400" />
        </div>
        <h3 className="text-white font-semibold text-lg">Đặt mật khẩu mới</h3>
        <p className="text-white/50 text-sm">Tạo mật khẩu mới cho tài khoản của bạn.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              {...register('newPassword')}
              type={showPassword ? 'text' : 'password'}
              placeholder="Mật khẩu mới"
              autoFocus
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
          {errors.newPassword
            ? <p className="text-red-400 text-xs mt-1">{errors.newPassword.message}</p>
            : <p className="text-xs text-white/50 mt-1">Tối thiểu 8 ký tự, có ít nhất 1 số</p>
          }
          <PasswordStrength password={newPassword} />
        </div>

        <div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              {...register('confirmPassword')}
              type={showConfirm ? 'text' : 'password'}
              placeholder="Xác nhận mật khẩu mới"
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
              Đang cập nhật...
            </span>
          ) : 'Đặt lại mật khẩu'}
        </button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="w-full flex items-center justify-center gap-1.5 text-white/40 hover:text-white/70 text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        Quay lại
      </button>
    </div>
  )
}

// ---- Login Form ----
function LoginForm({
  onSwitchTab,
  onOtpRequired,
  onForgotPassword,
}: {
  onSwitchTab: () => void
  onOtpRequired: (email: string) => void
  onForgotPassword: () => void
}) {
  const { login, loading } = useLogin()
  const { signIn, loading: googleLoading } = useGoogleAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const { register, handleSubmit, resetField, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setLoginError(null)
    try {
      await login(data.email, data.password)
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = err.message.toLowerCase()
        const looksLikeUnverifiedEmail =
          err.code === 'EMAIL_NOT_VERIFIED' ||
          (err.statusCode === 403 &&
            (msg.includes('chua duoc xac minh') ||
              msg.includes('chưa được xác minh') ||
              msg.includes('nhập mã otp') ||
              msg.includes('nhap ma otp')))

        if (looksLikeUnverifiedEmail) {
          onOtpRequired(data.email)
          return
        }
      }
      resetField('password')
      setLoginError(err instanceof ApiError ? err.message : 'Đăng nhập thất bại')
    }
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
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
          {loginError && !errors.password && (
            <p className="text-red-400 text-xs mt-1">{loginError}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
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
            type="button"
            onClick={onForgotPassword}
            className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
          >
            Quên mật khẩu?
          </button>
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
function RegisterForm({ onSwitchTab, onOtpRequired }: { onSwitchTab: () => void; onOtpRequired: (email: string) => void }) {
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
      const result = await registerUser({ fullName: data.fullName, email: data.email, password: data.password })
      onOtpRequired(result.email)
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
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
          {errors.password
            ? <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
            : <p className="text-xs text-white/50 mt-1">Tối thiểu 8 ký tự</p>
          }
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
  const { authModalOpen, authModalTab, closeAuthModal, openAuthModal } = useUiContext()

  // Registration OTP state (F5-resilient)
  const [pendingEmail, setPendingEmail] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return sessionStorage.getItem('pending_verification_email')
  })

  // Reset password flow state
  const [view, setView] = useState<ModalView>('tabs')
  const [resetEmail, setResetEmail] = useState<string | null>(null)
  const [resetOtp, setResetOtp] = useState<string | null>(null)

  const handleOtpRequired = (email: string) => {
    sessionStorage.setItem('pending_verification_email', email)
    setPendingEmail(email)
  }

  const handleCancelOtp = () => {
    sessionStorage.removeItem('pending_verification_email')
    setPendingEmail(null)
  }

  const handleClose = () => {
    // Do NOT clear pendingEmail on close — user might F5 or accidentally close
    closeAuthModal()
  }

  const handleForgotPassword = () => {
    setView('forgot')
  }

  const handleForgotEmailNext = (email: string) => {
    setResetEmail(email)
    setView('reset-otp')
  }

  const handleResetOtpNext = (otp: string) => {
    setResetOtp(otp)
    setView('new-password')
  }

  const handleResetSuccess = () => {
    // Go back to login tab
    setView('tabs')
    setResetEmail(null)
    setResetOtp(null)
    openAuthModal('login')
  }

  const showOtp = !!pendingEmail && view === 'tabs'

  const renderContent = () => {
    if (showOtp) {
      return <OtpForm email={pendingEmail!} onBack={handleCancelOtp} />
    }

    if (view === 'forgot') {
      return (
        <ForgotPasswordForm
          onNext={handleForgotEmailNext}
          onBack={() => setView('tabs')}
        />
      )
    }

    if (view === 'reset-otp' && resetEmail) {
      return (
        <ResetOtpForm
          email={resetEmail}
          onNext={handleResetOtpNext}
          onBack={() => setView('forgot')}
        />
      )
    }

    if (view === 'new-password' && resetEmail && resetOtp) {
      return (
        <NewPasswordForm
          email={resetEmail}
          otp={resetOtp}
          onSuccess={handleResetSuccess}
          onBack={() => setView('reset-otp')}
          onOtpError={() => { setView('reset-otp'); setResetOtp(null) }}
        />
      )
    }

    // Default: login / register tabs
    return (
      <>
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
          <LoginForm
            onSwitchTab={() => openAuthModal('register')}
            onOtpRequired={handleOtpRequired}
            onForgotPassword={handleForgotPassword}
          />
        ) : (
          <RegisterForm onSwitchTab={() => openAuthModal('login')} onOtpRequired={handleOtpRequired} />
        )}
      </>
    )
  }

  return (
    <Dialog open={authModalOpen} onOpenChange={(open) => !open && handleClose()}>
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
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  )
}
