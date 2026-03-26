import apiClient from '@/lib/api-client'
import type { User, OtpRequiredResponse } from '@/types'

/** What the backend returns in the response body after a successful auth call. */
interface AuthResponse {
  user: User
}

class AuthService {
  login(email: string, password: string): Promise<AuthResponse> {
    return apiClient.post('/auth/login', { email, password })
  }

  loginWithGoogle(googleToken: string): Promise<AuthResponse> {
    return apiClient.post('/auth/google', { token: googleToken })
  }

  register(data: {
    fullName: string
    email: string
    password: string
  }): Promise<OtpRequiredResponse> {
    return apiClient.post('/auth/register', data)
  }

  verifyOtp(email: string, otp: string): Promise<AuthResponse> {
    return apiClient.post('/auth/verify-otp', { email, otp })
  }

  resendOtp(email: string): Promise<{ cooldownSeconds: number }> {
    return apiClient.post('/auth/resend-otp', { email })
  }

  forgotPassword(email: string): Promise<{ cooldownSeconds: number }> {
    return apiClient.post('/auth/forgot-password', { email })
  }

  resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    return apiClient.post('/auth/reset-password', { email, otp, newPassword })
  }

  /** Verify the current session and return the authenticated user. */
  getMe(): Promise<User> {
    return apiClient.get('/user/me')
  }

  updateProfile(dto: { fullName?: string }, file?: File): Promise<User> {
    if (file) {
      const form = new FormData()
      if (dto.fullName) form.append('fullName', dto.fullName)
      form.append('file', file)
      return apiClient.patch('/user/profile', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }
    return apiClient.patch('/user/profile', dto)
  }

  /** Clears auth cookies server-side. Best-effort — never throws. */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // best-effort: ignore errors (cookies are cleared server-side on success)
    }
  }
}

export const authService = new AuthService()
