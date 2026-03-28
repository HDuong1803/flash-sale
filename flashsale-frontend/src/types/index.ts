// ─── Enums (mirror Prisma schema exactly) ───────────────────────────────────

export type UserRole = 'CUSTOMER' | 'MERCHANT' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BANNED'
export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type CampaignStatus = 'DRAFT' | 'APPROVED' | 'SCHEDULED' | 'ACTIVE' | 'ENDED'
export type ProductStatus = 'ACTIVE' | 'INACTIVE'
export type ReservationStatus = 'HOLDING' | 'PAID' | 'EXPIRED'
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'DONE' | 'CANCELLED'
// Phải khớp chính xác với enum PaymentStatus trong Prisma schema backend
export type PaymentStatus =
  | 'PENDING'     // Chờ user chuyển khoản
  | 'PROCESSING'  // Đang xử lý (saga đang chạy)
  | 'SUCCESS'     // Thanh toán thành công, đơn hàng đã tạo
  | 'FAILED'      // Thanh toán thất bại
  | 'REFUNDED'    // Đã hoàn tiền
  | 'CANCELLED'   // User huỷ trong quá trình thanh toán
export type PaymentMethod = 'VNPAY' | 'MOMO' | 'STRIPE' | 'SEPAY'
export type NotificationType =
  | 'RESERVATION_EXPIRING'
  | 'ORDER_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'CAMPAIGN_STARTING'
  | 'CAMPAIGN_RESCHEDULED'
  | 'RESCHEDULE_CONFIRMATION_NEEDED'

export interface OtpRequiredResponse {
  status: 'OTP_REQUIRED'
  email: string
}
export type ServiceStatus = 'UP' | 'DOWN'

export type Permission =
  // Customer (mua hàng)
  | 'browse_campaigns'
  | 'view_own_orders'
  | 'create_order'
  | 'view_notifications'
  | 'view_customer_dashboard'
  // Shop management (merchant đã approved)
  | 'view_shop_dashboard'
  | 'manage_campaigns'
  | 'manage_products'
  | 'view_shop_orders'
  | 'view_shop_revenue'
  // Admin
  | 'admin_dashboard'
  | 'admin_merchants'
  | 'admin_campaigns'
  | 'admin_orders'
  | 'admin_finance'
  | 'admin_products'
  | 'admin_users'
  | 'admin_profiles'
  | 'admin_notifications'
  | 'admin_stock_audit'
  | 'admin_system'
  | 'admin_action_logs'
  | 'admin_outbox'

// ─── Domain interfaces ───────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  fullName: string
  avatarUrl?: string
  createdAt: string
  updatedAt: string
}

/** Backend returns merchant nested — `merchant.businessName` */
export interface Campaign {
  id: string
  merchantId: string
  merchant?: { businessName: string }
  name: string
  description: string | null
  status: CampaignStatus
  startTime: string
  endTime: string
  campaignProducts: CampaignProduct[]
  createdAt: string
  updatedAt: string
  /** Chỉ có khi user đã đăng nhập — GET /campaigns/:id */
  isPreRegistered?: boolean
}

export interface CampaignProduct {
  id: string
  campaignId: string
  productId: string
  product?: { name: string; imageUrl?: string; originalPrice: number }
  salePrice: number
  saleQuantity: number
  remainingQuantity: number
  perUserLimit: number
}

export interface ProductImage {
  id: string
  url: string
  isPrimary: boolean
  sortOrder: number
}

export interface Product {
  id: string
  merchantId: string
  name: string
  description: string
  originalPrice: number
  /** Primary image URL — first in images[], null if no images */
  imageUrl: string | null
  /** All images with IDs for individual deletion */
  images: ProductImage[]
  /** All image URLs (shorthand) */
  imageUrls: string[]
  status: ProductStatus
  inventory: number
  createdAt: string
}

export interface ProductCampaignSummary {
  id: string
  name: string
  status: CampaignStatus
  startTime: string
  endTime: string
  salePrice: number
}

export interface OrderItem {
  id: string
  productId: string
  productName: string
  imageUrl?: string
  quantity: number
  unitPrice: number
  originalPrice: number
}

export interface Payment {
  id: string
  orderId: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  transactionId?: string
  paidAt?: string
}

export interface Order {
  id: string
  customerId: string
  merchantId: string
  reservationId: string
  status: OrderStatus
  totalAmount: number
  shippingAddress: string
  items: OrderItem[]
  payment?: Payment
  createdAt: string
  updatedAt: string
}

export interface Merchant {
  id: string
  userId: string
  email?: string
  businessName: string
  taxCode: string
  kycStatus: KycStatus
  rejectionReason?: string
  createdAt: string
  user?: { email: string; fullName: string; createdAt: string }
}

export interface MerchantApplication {
  id: string
  userId: string
  status: KycStatus
  businessName: string
  taxCode: string
  rejectionReason?: string
  createdAt: string
}

export interface MerchantProfile extends Merchant {
  description: string
  phone: string
  address: string
}

export interface Notification {
  id: string
  type: 'RESERVATION_EXPIRING' | 'ORDER_CONFIRMED' | 'PAYMENT_FAILED' | 'CAMPAIGN_STARTING' | 'CAMPAIGN_RESCHEDULED' | 'RESCHEDULE_CONFIRMATION_NEEDED'
  title: string
  message: string
  read: boolean
  createdAt: string
}

export interface NotificationPreferences {
  notificationsEnabled: boolean
  campaignReminderEnabled: boolean
  orderStatusEnabled: boolean
}

export interface DashboardMetrics {
  stockRemaining: number
  stockTotal: number
  totalOrders: number
  successOrders: number
  revenue: number
  conversionRate: number
  queueDepth: number
  ordersPerSecond: number
}

export interface DeadLetterJob {
  id: string
  type: string
  originalQueue: string
  errorMessage: string
  retryCount: number
  lastRetryAt?: string
  failedAt: string
  payload: Record<string, unknown>
}

export interface SystemHealth {
  postgres: ServiceStatus
  redis: ServiceStatus
  rabbitmq: ServiceStatus
  api: ServiceStatus
}

export interface PurchaseResult {
  status: 'RESERVED' | 'SOLD_OUT' | 'PROCESSING'
  reservationId?: string
  expiredAt?: string
}

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
  totalUsers: number
  activeMerchants: number
  liveCampaigns: number
  ordersToday: number
  revenueToday: number
  failedJobs: number
}

export interface QueueStats { high: number; normal: number }
export interface SystemLog { level: string; message: string; timestamp: string }
export interface ActivityLog { type: string; message: string; createdAt: string }
export interface OrdersByHour { bucket: string; orders: number }
export interface RevenueTrend { date: string; revenue: number }

export interface CampaignReport {
  totalOrders: number
  successOrders: number
  cancelledOrders: number
  totalRevenue: number
  conversionRate: number
}

export interface RevenueDateRange {
  startDate: string  // 'YYYY-MM-DD'
  endDate: string    // 'YYYY-MM-DD'
}

export interface MerchantRevenueSummary {
  totalRevenue: number
  revenueThisPeriod: number
  revenuePreviousPeriod: number
  growthRate: number
  totalOrders: number
  successOrders: number
  cancelledOrders: number
  avgOrderValue: number
}

export interface MerchantRevenueDaily {
  date: string
  revenue: number
  orders: number
}

export interface MerchantRevenueByCampaign {
  campaignId: string
  campaignName: string
  campaignStatus: string
  revenue: number
  orders: number
}


export interface MerchantRevenueTopProduct {
  productId: string
  productName: string
  revenue: number
  quantity: number
}

export interface MerchantRevenue {
  summary: MerchantRevenueSummary
  dailyRevenue: MerchantRevenueDaily[]
  byCampaign: MerchantRevenueByCampaign[]
  topProducts: MerchantRevenueTopProduct[]
}


