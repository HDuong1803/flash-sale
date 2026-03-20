import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthState, UserRole, Permission, User } from '@/types'
import { toast } from 'sonner'

const CUSTOMER_PERMISSIONS: Permission[] = [
  'browse_campaigns',
  'purchase',
  'view_own_orders',
  'pre_register',
  'apply_merchant',
]

const MERCHANT_PERMISSIONS: Permission[] = [
  ...CUSTOMER_PERMISSIONS.filter((p) => p !== 'apply_merchant'),
  'create_campaign',
  'manage_products',
  'view_merchant_orders',
  'view_merchant_dashboard',
]

const ADMIN_PERMISSIONS: Permission[] = [
  ...MERCHANT_PERMISSIONS,
  'admin_approve',
  'admin_users',
  'admin_system',
]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  CUSTOMER: CUSTOMER_PERMISSIONS,
  MERCHANT: MERCHANT_PERMISSIONS,
  ADMIN:    ADMIN_PERMISSIONS,
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
    // Signal AppLayout to open the login modal after the redirect lands.
    // Full reload is needed to clear stale page data and reset hook state.
    sessionStorage.setItem('auth:session-expired', '1')
    window.location.href = '/campaigns'
  })
}
