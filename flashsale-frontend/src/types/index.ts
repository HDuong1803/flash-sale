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
export type PaymentMethod = 'VNPAY' | 'MOMO' | 'STRIPE'
export type StripeAccountStatus =
  | 'NOT_CONNECTED'
  | 'PENDING'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'DISABLED'
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
  | 'admin_finance'
  | 'admin_users'
  | 'admin_profiles'
  | 'admin_notifications'
  | 'admin_stock_audit'
  | 'admin_system'
  | 'admin_action_logs'
  | 'admin_outbox'
  | 'admin_benchmark'
  | 'admin_fraud'
  | 'admin_analytics'

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
  commissionCategoryId?: string | null
  commissionRate?: number
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
  userPaidQuantity?: number
}

export interface CommissionCategory {
  id: string
  code: string
  name: string
  description?: string | null
  defaultRate: number
  isActive: boolean
  sortOrder: number
}

export interface CheckoutPaymentMethod {
  method: PaymentMethod
  displayName: string
  isDefault: boolean
}

export interface PaymentGatewayConfig {
  gateway: PaymentMethod
  displayName: string
  enabled: boolean
  isDefault: boolean
  config: Record<string, unknown> | null
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
  customer?: { fullName: string }
  merchantId: string
  reservationId: string
  status: OrderStatus
  totalAmount: number
  shippingAddress: string
  items: OrderItem[]
  payment?: Payment
  campaignId?: string
  campaignName?: string
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

export interface StripeConnectStatusResponse {
  status: StripeAccountStatus
  chargesEnabled: boolean
  payoutsEnabled: boolean
  connectedAt?: string | null
  onboardingUrl?: string
}

export interface Notification {
  id: string
  type: 'RESERVATION_EXPIRING' | 'ORDER_CONFIRMED' | 'PAYMENT_FAILED' | 'CAMPAIGN_STARTING' | 'CAMPAIGN_RESCHEDULED' | 'RESCHEDULE_CONFIRMATION_NEEDED' | 'SYSTEM_ALERT'
  title: string
  message: string
  read: boolean
  createdAt: string
}

export interface NotificationPreferences {
  notificationsEnabled: boolean
  campaignReminderEnabled: boolean
  orderStatusEnabled: boolean
  telegramEnabled: boolean
}

export interface TelegramLinkStatus {
  linked: boolean
  telegramUsername?: string | null
  telegramFirstName?: string | null
  linkedAt?: string | null
}

export interface DashboardMetrics {
  stockRemaining: number
  stockTotal: number
  totalOrders: number
  successOrders: number
  totalReservations: number
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

export interface FinanceDashboardSummary {
  grossRevenue: number
  commissionRevenue: number
  merchantNetRevenue: number
  averageCommissionRatePct: number
  totalCommissionOrders: number
}

export interface FinanceTrendItem {
  date: string
  commissionRevenue: number
  grossRevenue: number
}

export interface CommissionCategoryBreakdown {
  categoryId: string
  code: string
  name: string
  defaultRate: number
  commissionRevenue: number
  grossRevenue: number
  orders: number
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

// ─── Admin Monitoring Types ──────────────────────────────────────────────────

export interface AdminMerchantProfile {
  id: string
  userId: string
  businessName: string
  taxCode: string
  businessAddress: string
  businessPhone: string
  businessEmail: string
  kycStatus: KycStatus
  rejectionReason?: string
  createdAt: string
  updatedAt: string
  user: {
    fullName: string
    email: string
    status: UserStatus
  }
}

export interface AdminMerchantOverviewProfile {
  id: string
  userId: string
  businessName: string
  taxCode: string
  description?: string | null
  businessPhone?: string | null
  businessAddress?: string | null
  businessEmail: string
  kycStatus: KycStatus
  rejectionReason?: string | null
  approvedAt?: string | null
  approvedBy?: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    fullName: string
    email: string
    status: UserStatus
    lastLoginAt?: string | null
    createdAt: string
    updatedAt: string
  }
}

export interface AdminMerchantOverviewMetrics {
  productsTotal: number
  activeProducts: number
  campaignsTotal: number
  campaignsByStatus: Record<CampaignStatus, number>
  campaignsDeleted: number
  campaignsHiddenByMerchant: number
  ordersTotal: number
  ordersDone: number
  ordersCancelled: number
  reservationsTotal: number
  conversionRatePct: number
  revenueTotal: number
  revenueInRange: number
  averageOrderValue: number
}

export interface AdminMerchantOverviewCampaign {
  id: string
  name: string
  status: CampaignStatus
  startTime: string
  endTime: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  merchantHiddenAt?: string | null
  productsCount: number
  preRegistrationsCount: number
  totalSaleQuantity: number
  totalRemainingQuantity: number
  ordersCount: number
  revenue: number
}

export interface AdminMerchantOverviewOrder {
  id: string
  status: OrderStatus
  totalAmount: number
  shippingAddress: string
  createdAt: string
  customer: {
    id: string
    fullName: string
    email: string
  }
  payment?: {
    status: PaymentStatus
    method: PaymentMethod
    paidAt?: string | null
  } | null
  campaign?: {
    id: string
    name: string
    status: CampaignStatus
  } | null
}

export interface AdminMerchantOverviewTopProduct {
  productId: string
  productName: string
  quantity: number
  revenue: number
}

export interface AdminMerchantOverview {
  profile: AdminMerchantOverviewProfile
  metrics: AdminMerchantOverviewMetrics
  campaigns: AdminMerchantOverviewCampaign[]
  recentOrders: AdminMerchantOverviewOrder[]
  topProducts: AdminMerchantOverviewTopProduct[]
  timeframe: {
    days: number
    since: string
    until: string
  }
}

export interface UserActionLog {
  id: string
  userId?: string
  ip?: string
  action: string
  targetId?: string
  createdAt: string
}

export interface OutboxEvent {
  id: string
  type: string
  aggregateId: string
  payload: Record<string, unknown>
  processed: boolean
  processedAt?: string
  createdAt: string
}

export interface CampaignMonitorOverview {
  visits: number
  uniqueVisitors: number
  reservations: number
  successfulPayments: number
  reservationToPaymentRatePct: number
  avgCheckoutLatencySeconds: number
  peakActionsPerSecond: number
  volatilityIndex: number
  queueDepth: number
  failedJobsLastHour: number
}

export interface CampaignMonitorTimelineItem {
  bucket: string
  visits: number
  reservations: number
  successfulPayments: number
  successRatePct: number
}

// ─── Admin User Detail ───────────────────────────────────────────────────────

export interface AdminUserDetailRecentOrder {
  id: string
  status: OrderStatus
  totalAmount: number
  shippingAddress: string
  createdAt: string
  campaignId: string | null
  campaignName: string | null
  campaignStatus: CampaignStatus | null
  itemCount: number
  paymentStatus: PaymentStatus | null
  merchantName: string
}

export interface AdminUserDetailPreRegistration {
  id: string
  createdAt: string
  campaignId: string
  campaignName: string
  campaignStatus: CampaignStatus
  campaignStartTime: string
  campaignEndTime: string
}

export interface AdminUserDetailTopCampaign {
  campaignId: string
  campaignName: string
  merchantName: string
  orderCount: number
  totalSpend: number
}

export interface AdminUserDetail {
  // Identity
  id: string
  email: string
  fullName: string
  role: UserRole
  status: UserStatus
  emailVerified: boolean
  avatarUrl: string | null
  lastLoginAt: string | null
  createdAt: string

  // Profile
  phone: string | null
  defaultAddress: string | null

  // Telegram
  telegramLinked: boolean
  telegramUsername: string | null
  telegramLinkedAt: string | null

  // Notification preferences
  notificationsEnabled: boolean
  telegramEnabled: boolean
  campaignReminderEnabled: boolean
  orderStatusEnabled: boolean

  // Purchase stats
  totalOrders: number
  completedOrders: number
  cancelledOrders: number
  totalSpend: number
  avgOrderValue: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  purchasesLast30Days: number
  purchasesLast90Days: number
  unreadNotifications: number

  // Order breakdown
  ordersPending: number
  ordersConfirmed: number
  ordersShipping: number
  ordersDone: number
  ordersCancelled: number

  // Collections
  recentOrders: AdminUserDetailRecentOrder[]
  preRegistrations: AdminUserDetailPreRegistration[]
  topCampaigns: AdminUserDetailTopCampaign[]
}

// ─── Benchmark Types (Distributed Lock Demo) ────────────────────────────────

export type LockStrategy = 'NO_LOCK' | 'DB_LOCK' | 'REDIS_LUA'

/** Kết quả benchmark một strategy */
export interface BenchmarkResult {
  strategy: LockStrategy
  concurrentUsers: number
  stockAmount: number
  /** Số request mua thành công */
  succeeded: number
  /** Số request bị SOLD_OUT */
  failed: number
  /** Số request lỗi (exception) */
  errors: number
  /** Số lần oversell phát hiện (stock âm) */
  oversellCount: number
  /** Tồn kho cuối sau benchmark */
  finalStock: number | null
  /** Tồn kho kỳ vọng (max 0, stockAmount - concurrentUsers) */
  expectedFinalStock: number
  /** true khi oversellCount=0 và finalStock >= 0 */
  isCorrect: boolean
  /** Tổng thời gian chạy (ms) */
  totalTimeMs: number
  /** Throughput (requests/giây) */
  throughputRPS: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
}

/** So sánh 3 strategies */
export interface BenchmarkComparison {
  noLock: BenchmarkResult
  dbLock: BenchmarkResult
  redisLua: BenchmarkResult
  /** Luôn là 'REDIS_LUA' */
  recommendation: LockStrategy
  /** Chuỗi kết luận human-readable */
  conclusion: string
}

/** Params gửi lên API */
export interface RunBenchmarkParams {
  campaignProductId: string
  concurrentUsers: number
  stockAmount: number
}

export interface BenchmarkAuditLog {
  id: string
  productId: string
  delta: number
  stockBefore: number
  stockAfter: number
  reason: string
  referenceId: string | null
  triggeredBy: string | null
  isOversell: boolean
  strategy: LockStrategy
  executionTimeUs: number
  createdAt: string
}

export interface BenchmarkAuditLogResponse {
  data: BenchmarkAuditLog[]
  total: number
}

// ─── Fraud Types ──────────────────────────────────────────────────────────────

export interface FraudEvent {
  id: string
  userId?: string | null
  ipAddress: string
  userAgent: string
  requestType: string
  riskScore: number
  blocked: boolean
  blockReason?: string | null
  triggeredRules: string[]
  signals: Record<string, unknown>
  campaignId?: string | null
  createdAt: string
}

export interface FraudStats {
  total: number
  blocked: number
  blockRate: number
  topIps: { ip: string; count: number }[]
}

export interface IpBlacklistEntry {
  id: string
  ipAddress: string
  reason: string
  createdBy: string
  expiresAt: string | null
  createdAt: string
}

// ─── Analytics Types ──────────────────────────────────────────────────────────

/** Snapshot tồn kho/doanh thu tại một thời điểm */
export interface AnalyticsSnapshot {
  id: string
  campaignProductId: string
  stockRemaining: number
  stockRatio: number
  totalSold: number
  totalRevenue: number
  conversionRate: number
  revenueVelocity: number
  snapshotAt: string
}

/** Một bước trong funnel chuyển đổi */
export interface FunnelStep {
  step: string
  count: number
  conversionRate: number
  dropoffRate: number
}

/** Heatmap số lượng thanh toán theo giờ trong ngày */
export interface HeatmapHour {
  hour: number
  count: number
}

/** Tổng quan một campaign */
export interface CampaignOverview {
  campaignId: string
  stockRemaining: number
  stockRatio: number
  totalSold: number
  totalRevenue: number
  conversionRate: number
  revenueVelocity: number
  snapshotAt: string
}

/** Kết quả dự đoán hết hàng */
export interface StockoutPrediction {
  campaignProductId: string
  stockRemaining: number
  trend: 'STABLE' | 'DECLINING' | 'ACCELERATING' | 'SOLD_OUT'
  /** Thời điểm dự đoán hết hàng, null nếu không dự đoán được trong 2h */
  stockoutAt: string | null
  /** R² của regression (0–1, càng cao càng tin cậy) */
  confidence: number
  /** Số snapshot dùng để tính */
  dataPoints: number
  computedAt: string
}

// ─── Fulfillment Types ────────────────────────────────────────────────────────

export type FulfillmentStatus =
  | 'AWAITING'
  | 'ADDRESS_ISSUE'
  | 'LABEL_BOOKED'
  | 'PICKED'
  | 'PACKED'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'CANCELLED'

export type QcStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'REWORK'

export interface TrackingEvent {
  id: string
  carrierStatus: string
  description?: string | null
  location?: string | null
  occurredAt: string
}

export interface FulfillmentCarrier {
  code: string
  displayName: string
}

export interface FulfillmentOrder {
  id: string
  orderId: string
  fulfillStatus: FulfillmentStatus
  carrier?: FulfillmentCarrier | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  labelUrl?: string | null
  labelPdfUrl?: string | null
  slaDeadline?: string | null
  slaBreached: boolean
  labelCostCents?: number | null
  normalizedAddress?: object | null
  trackingEvents: TrackingEvent[]
}

export interface QcChecklistItem {
  key: string
  label: string
  passed: boolean | null
}

export interface QcCheckpoint {
  id: string
  orderId: string
  status: QcStatus
  inspector: {
    id: string
    email: string
    fullName: string | null
  } | null
  checklist: QcChecklistItem[]
  failReason: string | null
  notes: string | null
  photoUrls: string[]
  passedAt: string | null
  failedAt: string | null
  createdAt: string
}

export interface FulfillmentRule {
  id: string
  name: string
  priority: number
  minWeightGrams?: number | null
  maxWeightGrams?: number | null
  minOrderCents?: number | null
  maxOrderCents?: number | null
  destCountry?: string | null
  destState?: string | null
  carrier: { id: string; code: string; displayName: string }
  slaHours: number
  active: boolean
}

export interface Carrier {
  id: string
  code: string
  displayName: string
  logoUrl?: string | null
  sandboxMode: boolean
  active: boolean
}
