import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthState, UserRole, Permission, User } from '@/types'
import { toast } from 'sonner'

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  CUSTOMER: [
    'browse_campaigns',
    'purchase',
    'view_own_orders',
    'pre_register',
    'apply_merchant',
  ],
  MERCHANT: [
    'browse_campaigns',
    'purchase',
    'view_own_orders',
    'pre_register',
    'create_campaign',
    'manage_products',
    'view_merchant_orders',
    'view_merchant_dashboard',
  ],
  ADMIN: ['browse_campaigns', 'admin_approve', 'admin_users', 'admin_system'],
}

/**
 * Auth store — only the user object and role-based state are persisted here.
 * Tokens live exclusively in HttpOnly cookies managed by the backend; they are
 * never read or written by JavaScript.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      merchantApplicationStatus: 'NONE',

      setAuth: (user: User) => set({ user, isAuthenticated: true }),

      setMerchantApplicationStatus: (s) =>
        set({ merchantApplicationStatus: s }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          merchantApplicationStatus: 'NONE',
        }),

      hasPermission: (permission) => {
        const { user } = get()
        return user ? ROLE_PERMISSIONS[user.role].includes(permission) : false
      },
    }),
    { name: 'flashsale-auth' },
  ),
)

// When the api-client's 401 → refresh chain fails, force logout globally
if (typeof window !== 'undefined') {
  window.addEventListener('auth:force-logout', () => {
    useAuthStore.getState().logout()
    toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    setTimeout(() => {
      import('@/stores/ui.store').then(({ useUiStore }) => {
        useUiStore.getState().openAuthModal('login')
      })
    }, 300)
  })
}
