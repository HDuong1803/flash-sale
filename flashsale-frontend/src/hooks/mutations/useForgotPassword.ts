import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { ApiError } from '@/lib/api-client'

export function useForgotPassword() {
  const [loading, setLoading] = useState(false)

  const forgotPassword = async (email: string): Promise<{ cooldownSeconds: number }> => {
    setLoading(true)
    try {
      const result = await authService.forgotPassword(email)
      toast.success('Nếu email tồn tại trong hệ thống, mã OTP sẽ được gửi đến hộp thư của bạn.')
      return result
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không thể gửi mã OTP')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { forgotPassword, loading }
}
