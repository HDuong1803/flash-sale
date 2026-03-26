import { useState } from 'react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { ApiError } from '@/lib/api-client'
import type { OtpRequiredResponse } from '@/types'

export function useRegister() {
  const [loading, setLoading] = useState(false)

  const register = async (data: {
    fullName: string
    email: string
    password: string
  }): Promise<OtpRequiredResponse> => {
    setLoading(true)
    try {
      return await authService.register(data)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Đăng ký thất bại')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { register, loading }
}
