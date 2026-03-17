export type UserRole = 'CUSTOMER' | 'MERCHANT' | 'ADMIN'
export type CampaignStatus = 'DRAFT' | 'APPROVED' | 'SCHEDULED' | 'ACTIVE' | 'ENDED'
export type ReservationStatus = 'HOLDING' | 'PAID' | 'EXPIRED'
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'DONE' | 'CANCELLED'
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED'
export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type ProductStatus = 'ACTIVE' | 'INACTIVE'
export type Permission =
  | 'browse_campaigns' | 'purchase' | 'view_own_orders' | 'pre_register' | 'apply_merchant'
  | 'create_campaign' | 'manage_products' | 'view_merchant_orders' | 'view_merchant_dashboard'
  | 'admin_approve' | 'admin_users' | 'admin_system'

export interface User { id: string; email: string; role: UserRole; fullName: string; avatarUrl?: string; createdAt: string }
export interface Campaign {
  id: string; name: string; merchantId: string; merchantName: string
  status: CampaignStatus; startTime: string; endTime: string
  description: string; products: CampaignProduct[]; createdAt: string
}
export interface CampaignProduct {
  id: string; productId: string; productName: string; imageUrl: string
  originalPrice: number; salePrice: number; saleQuantity: number
  remainingQuantity: number; perUserLimit: number
}
export interface Product {
  id: string; merchantId: string; name: string; description: string
  originalPrice: number; imageUrl: string; status: ProductStatus; inventory: number; createdAt: string
}
export interface Order {
  id: string; customerId: string; merchantId: string; reservationId: string
  status: OrderStatus; totalAmount: number; shippingAddress: string
  items: OrderItem[]; payment?: Payment; createdAt: string
}
export interface OrderItem { id: string; productId: string; productName: string; imageUrl: string; quantity: number; unitPrice: number }
export interface Payment { id: string; orderId: string; amount: number; method: 'VNPAY' | 'MOMO' | 'STRIPE'; status: PaymentStatus; transactionId?: string; paidAt?: string }
export interface Merchant { id: string; userId: string; email: string; businessName: string; taxCode: string; kycStatus: KycStatus; createdAt: string }
export interface MerchantApplication { id: string; userId: string; status: KycStatus; businessName: string; taxCode: string; rejectionReason?: string; createdAt: string }
export interface MerchantProfile extends Merchant { description: string; phone: string; address: string }
export interface Notification { id: string; type: 'RESERVATION_EXPIRING' | 'ORDER_CONFIRMED' | 'PAYMENT_FAILED' | 'CAMPAIGN_STARTING'; title: string; message: string; read: boolean; createdAt: string }
export interface DashboardMetrics { stockRemaining: number; stockTotal: number; totalOrders: number; successOrders: number; revenue: number; conversionRate: number; queueDepth: number; ordersPerSecond: number }
export interface DeadLetterJob { id: string; type: 'ORDER_PROCESSING' | 'PAYMENT'; errorMessage: string; retryCount: number; failedAt: string; payload: Record<string, unknown> }
export interface SystemHealth { postgres: 'UP' | 'DOWN'; redis: 'UP' | 'DOWN'; rabbitmq: 'UP' | 'DOWN'; api: 'UP' | 'DOWN' }
export interface PurchaseResult { status: 'RESERVED' | 'SOLD_OUT' | 'PROCESSING'; reservationId?: string; expiredAt?: string }

export interface MerchantStats {
  revenueToday?: number
  revenueTrend?: number
  activeCampaigns?: number
  campaignEndingSoon?: number
  ordersToday?: number
  ordersTrend?: number
  conversionRate?: number
}

export interface AdminStats {
  totalUsers?: number
  activeMerchants?: number
  activeCampaigns?: number
  ordersToday?: number
  revenueToday?: number
  failedJobs?: number
}

export interface QueueStats { high: number; normal: number }
export interface SystemLog { level: 'ERROR' | 'WARN' | 'INFO'; message: string; timestamp: string }
export interface ActivityLog { type: string; message: string; createdAt: string }
export interface OrdersByHour { hour: string; orders: number }
export interface RevenueTrend { date: string; revenue: number }

// Auth store state — tokens live in HttpOnly cookies, not in JS state
export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  merchantApplicationStatus: 'NONE' | KycStatus
  setAuth: (user: User) => void
  setMerchantApplicationStatus: (s: 'NONE' | KycStatus) => void
  logout: () => void
  hasPermission: (permission: Permission) => boolean
}

// UI store state
export interface UiState {
  authModalOpen: boolean
  authModalTab: 'login' | 'register'
  sidebarCollapsed: boolean
  openAuthModal: (tab?: 'login' | 'register') => void
  closeAuthModal: () => void
  toggleSidebar: () => void
}
