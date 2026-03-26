import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { ApiError } from '@/lib/api-client'

export function useResetPassword() {
  const [loading, setLoading] = useState(false)

  const resetPassword = async (email: string, otp: string, newPassword: string): Promise<void> => {
    setLoading(true)
    try {
      await authService.resetPassword(email, otp, newPassword)
      toast.success('Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Không thể đặt lại mật khẩu')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { resetPassword, loading }
}
