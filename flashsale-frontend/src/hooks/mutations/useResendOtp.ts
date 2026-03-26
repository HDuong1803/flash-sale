import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { ApiError } from '@/lib/api-client'

export function useResendOtp() {
  const [loading, setLoading] = useState(false)

  const resendOtp = async (email: string): Promise<{ cooldownSeconds: number }> => {
    setLoading(true)
    try {
      const result = await authService.resendOtp(email)
      toast.success('Đã gửi mã OTP mới. Vui lòng kiểm tra hộp thư.')
      return result
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không thể gửi lại mã OTP')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { resendOtp, loading }
}
