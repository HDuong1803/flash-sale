import type { UserRole, Permission } from '@/types'

const CUSTOMER_PERMISSIONS: Permission[] = [
  'browse_campaigns',
  'view_own_orders',
  'create_order',
  'view_notifications',
  'view_customer_dashboard',
]

// Shop management permissions — only active when merchant KYC is APPROVED.
const SHOP_MANAGEMENT_PERMISSIONS: Permission[] = [
  'view_shop_dashboard',
  'manage_campaigns',
  'manage_products',
  'view_shop_orders',
  'view_shop_revenue',
]

// Merchant is also a buyer — gets all customer permissions + shop management
const MERCHANT_PERMISSIONS: Permission[] = [
  ...CUSTOMER_PERMISSIONS,
  ...SHOP_MANAGEMENT_PERMISSIONS,
]

const ADMIN_PERMISSIONS: Permission[] = [
  'admin_dashboard',
  'admin_merchants',
  'admin_campaigns',
  'admin_finance',
  'admin_users',
  'admin_profiles',
  'admin_notifications',
  'admin_stock_audit',
  'admin_system',
  'admin_action_logs',
  'admin_outbox',
  'admin_benchmark',
  'admin_fraud',
  'admin_analytics',
  'admin_pricing',
]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  CUSTOMER: CUSTOMER_PERMISSIONS,
  MERCHANT: MERCHANT_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
}
