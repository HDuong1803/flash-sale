import apiClient, { withRetry } from '@/lib/api-client'
import type {
  Merchant, Campaign, User, DeadLetterJob, SystemHealth,
  AdminStats, QueueStats, SystemLog, ActivityLog, OrdersByHour,
  RevenueTrend, KycStatus, CampaignStatus, UserRole,
  AdminMerchantProfile, UserActionLog, OutboxEvent, FinanceDashboardSummary,
  FinanceTrendItem, CommissionCategoryBreakdown, PaymentGatewayConfig, PaymentMethod,
  CampaignMonitorOverview, CampaignMonitorTimelineItem,
  AdminMerchantOverview, AdminUserDetail,
  BenchmarkResult, BenchmarkComparison, RunBenchmarkParams,
  BenchmarkAuditLogResponse, LockStrategy,
  BenchmarkRun, StrategyMode,
  FraudStats, FraudEvent, IpBlacklistEntry,
  CampaignOverview, FunnelStep, HeatmapHour, AnalyticsSnapshot, StockoutPrediction,
  FulfillmentOrder, FulfillmentRule, Carrier, QcCheckpoint,
  AdminOrder, AdminProduct,
} from '@/types'

class AdminService {
  getMerchants(status?: KycStatus): Promise<Merchant[]> {
    return withRetry(() => apiClient.get('/admin/merchants', { params: { status } }))
  }
  approveMerchant(id: string): Promise<{ success: boolean }> {
    return apiClient.patch(`/admin/merchants/${id}/approve`)
  }
  rejectMerchant(id: string, reason: string): Promise<Merchant> {
    return apiClient.patch(`/admin/merchants/${id}/reject`, { reason })
  }
  getCampaigns(status?: CampaignStatus): Promise<Campaign[]> {
    return withRetry(() => apiClient.get('/admin/campaigns', { params: { status } }))
  }
  approveCampaign(id: string): Promise<Campaign> {
    return apiClient.patch(`/admin/campaigns/${id}/approve`)
  }
  rejectCampaign(id: string, reason: string): Promise<Campaign> {
    return apiClient.patch(`/admin/campaigns/${id}/reject`, { reason })
  }
  forceStartCampaign(id: string): Promise<{ started: boolean }> {
    return apiClient.post(`/admin/campaigns/${id}/force-start`)
  }
  forceStopCampaign(id: string): Promise<{ stopped: boolean }> {
    return apiClient.post(`/admin/campaigns/${id}/force-stop`)
  }
  deleteExpiredCampaign(id: string): Promise<{ deleted: boolean }> {
    return apiClient.delete(`/admin/campaigns/${id}`)
  }
  getUsers(filters?: { role?: UserRole; search?: string; page?: number; limit?: number }): Promise<User[]> {
    return withRetry(() => apiClient.get('/admin/users', { params: filters }))
  }
  getUserDetail(id: string): Promise<AdminUserDetail> {
    return withRetry(() => apiClient.get(`/admin/users/${id}`))
  }
  suspendUser(id: string): Promise<User> {
    return apiClient.patch(`/admin/users/${id}/suspend`)
  }
  activateUser(id: string): Promise<User> {
    return apiClient.patch(`/admin/users/${id}/activate`)
  }
  getDeadLetterJobs(): Promise<DeadLetterJob[]> {
    return withRetry(() => apiClient.get('/admin/dead-letter-queue'))
  }
  retryJob(id: string): Promise<{ retried: boolean }> {
    return apiClient.post(`/admin/dead-letter-queue/${id}/retry`)
  }
  discardJob(id: string): Promise<{ discarded: boolean }> {
    return apiClient.delete(`/admin/dead-letter-queue/${id}`)
  }
  getSystemHealth(): Promise<SystemHealth> {
    return withRetry(() => apiClient.get('/admin/system/health'))
  }
  getStats(): Promise<AdminStats> {
    return withRetry(() => apiClient.get('/admin/stats'))
  }
  getOrders(params: { page: number; limit: number; status?: string; search?: string }): Promise<{ items: AdminOrder[]; total: number }> {
    return withRetry(() => apiClient.get('/admin/orders', { params }))
  }
  getProducts(params: { page: number; limit: number; search?: string; merchantId?: string }): Promise<{ items: AdminProduct[]; total: number }> {
    return withRetry(() => apiClient.get('/admin/products', { params }))
  }
  getOrdersByTime(start: Date, end: Date): Promise<OrdersByHour[]> {
    return withRetry(() => apiClient.get(`/admin/stats/orders-by-time?start=${start.toISOString()}&end=${end.toISOString()}`))
  }
  getRevenueTrend(): Promise<RevenueTrend[]> {
    return withRetry(() => apiClient.get('/admin/stats/revenue-trend'))
  }
  getActivity(): Promise<ActivityLog[]> {
    return withRetry(() => apiClient.get('/admin/activity'))
  }
  getQueueStats(): Promise<QueueStats> {
    return withRetry(() => apiClient.get('/admin/system/queue-stats'))
  }
  getSystemLogs(): Promise<SystemLog[]> {
    return withRetry(() => apiClient.get('/admin/system/logs'))
  }
  
  // ─── Monitoring & Audit ───────────────────────────────────────────────
  
  getMerchantProfiles(status?: KycStatus): Promise<AdminMerchantProfile[]> {
    return withRetry(() => apiClient.get('/admin/merchant-profiles', { params: { status } }))
  }

  getMerchantOverview(id: string, days = 30): Promise<AdminMerchantOverview> {
    return withRetry(() =>
      apiClient.get(`/admin/merchant-profiles/${id}/overview`, { params: { days } })
    )
  }
  
  getUserActionLogs(params: {
    page: number
    limit: number
    action?: string
    userId?: string
    ip?: string
    from?: string
    to?: string
  }): Promise<{ items: UserActionLog[]; total: number }> {
    return withRetry(() => apiClient.get('/admin/user-action-logs', { params }))
  }
  
  getOutboxEvents(): Promise<OutboxEvent[]> {
    return withRetry(() => apiClient.get('/admin/outbox-events'))
  }

  getFinanceSummary(): Promise<FinanceDashboardSummary> {
    return withRetry(() => apiClient.get('/admin/finance/summary'))
  }

  getFinanceTrend(): Promise<FinanceTrendItem[]> {
    return withRetry(() => apiClient.get('/admin/finance/trend'))
  }

  getFinanceByCategory(): Promise<CommissionCategoryBreakdown[]> {
    return withRetry(() => apiClient.get('/admin/finance/by-category'))
  }

  getPaymentGatewayConfigs(): Promise<PaymentGatewayConfig[]> {
    return withRetry(() => apiClient.get('/admin/payments/gateways'))
  }

  updatePaymentGatewayConfig(
    gateway: PaymentMethod,
    data: Partial<Pick<PaymentGatewayConfig, 'enabled' | 'isDefault' | 'displayName' | 'config'>>
  ): Promise<PaymentGatewayConfig> {
    return apiClient.patch(`/admin/payments/gateways/${gateway}`, data)
  }

  getCampaignMonitorOverview(params?: {
    campaignId?: string
    minutes?: number
  }): Promise<CampaignMonitorOverview> {
    return withRetry(() => apiClient.get('/admin/campaign-monitor/overview', { params }))
  }

  getCampaignMonitorTimeline(params?: {
    campaignId?: string
    minutes?: number
    bucketMinutes?: number
  }): Promise<CampaignMonitorTimelineItem[]> {
    return withRetry(() => apiClient.get('/admin/campaign-monitor/timeline', { params }))
  }

  // ─── Benchmark API ──────────────────────────────────────────────────────────

  /**
   * Chạy benchmark so sánh 3 strategies: NO_LOCK, DB_LOCK, REDIS_LUA.
   * Timeout 5 phút — với 10k–20k users + DB_LOCK có thể mất nhiều phút.
   */
  runBenchmarkAll(params: RunBenchmarkParams): Promise<BenchmarkComparison> {
    return apiClient.post('/admin/benchmark/run-all', params, { timeout: 300_000 })
  }

  /**
   * Chạy benchmark một strategy cụ thể.
   * Timeout 5 phút cho kịch bản cực đại.
   */
  runBenchmarkOne(params: RunBenchmarkParams & { strategy: LockStrategy }): Promise<BenchmarkResult> {
    return apiClient.post('/admin/benchmark/run', params, { timeout: 300_000 })
  }

  // ─── Async Benchmark API ────────────────────────────────────────────────────

  /**
   * Bắt đầu benchmark job background — trả về runId ngay lập tức (202 Accepted).
   */
  startBenchmark(params: {
    campaignProductId: string
    concurrentUsers: number
    stockAmount: number
    strategyMode: StrategyMode
  }): Promise<{ runId: string }> {
    return apiClient.post('/admin/benchmark/start', params)
  }

  /**
   * Poll trạng thái benchmark run theo runId.
   * Dùng withRetry vì đây là GET, an toàn khi retry.
   */
  getBenchmarkRun(runId: string): Promise<BenchmarkRun> {
    return withRetry(() => apiClient.get(`/admin/benchmark/runs/${runId}`))
  }

  /**
   * Lấy lịch sử tất cả benchmark runs có phân trang.
   */
  getBenchmarkHistory(
    page = 1,
    limit = 20
  ): Promise<{ items: BenchmarkRun[]; total: number; page: number; limit: number }> {
    return withRetry(() =>
      apiClient.get('/admin/benchmark/history', { params: { page, limit } })
    )
  }

  /**
   * Lấy stock audit log — lịch sử mọi thao tác stock.
   */
  getStockAuditLogs(params?: {
    productId?: string
    isOversell?: boolean
    strategy?: LockStrategy
    page?: number
    limit?: number
  }): Promise<BenchmarkAuditLogResponse> {
    return withRetry(() => apiClient.get('/admin/benchmark/audit-logs', { params }))
  }

  // ─── Fraud API ──────────────────────────────────────────────────────────────

  /** Thống kê fraud (tổng events, blocked, block rate, top IPs). */
  getFraudStats(period: '1h' | '6h' | '24h' | '7d' | '30d' = '24h'): Promise<FraudStats> {
    return withRetry(() => apiClient.get('/admin/fraud/stats', { params: { period } }))
  }

  /** Danh sách fraud events có phân trang. */
  getFraudEvents(params?: {
    page?: number
    limit?: number
    blocked?: boolean
  }): Promise<{ data: FraudEvent[]; total: number }> {
    return withRetry(() => apiClient.get('/admin/fraud/events', { params }))
  }

  /** Danh sách IP đang bị blacklist. */
  getIpBlacklist(): Promise<IpBlacklistEntry[]> {
    return withRetry(() => apiClient.get('/admin/fraud/blacklist'))
  }

  /** Thêm IP vào blacklist. */
  blacklistIp(ipAddress: string, reason: string, hours?: number): Promise<void> {
    return apiClient.post('/admin/fraud/blacklist', { ipAddress, reason, hours })
  }

  /** Xóa IP khỏi blacklist. */
  removeFromBlacklist(ip: string): Promise<void> {
    return apiClient.delete(`/admin/fraud/blacklist/${ip}`)
  }

  // ─── Analytics API ──────────────────────────────────────────────────────────

  /** Snapshot tổng quan của một campaign (stock, revenue, conversion rate). */
  getCampaignAnalyticsOverview(campaignId: string): Promise<CampaignOverview | null> {
    return withRetry(() => apiClient.get(`/analytics/campaigns/${campaignId}/overview`))
  }

  /** Dữ liệu funnel chuyển đổi của campaign. */
  getCampaignFunnel(campaignId: string): Promise<FunnelStep[]> {
    return withRetry(() => apiClient.get(`/analytics/campaigns/${campaignId}/funnel`))
  }

  /** Heatmap thanh toán theo giờ trong ngày (mảng 24 phần tử). */
  getCampaignHeatmap(campaignId: string): Promise<HeatmapHour[]> {
    return withRetry(() => apiClient.get(`/analytics/campaigns/${campaignId}/heatmap`))
  }

  /** Time-series snapshots của một campaign product (dùng để vẽ biểu đồ). */
  getProductTimeSeries(
    campaignId: string,
    campaignProductId: string,
    limit?: number
  ): Promise<AnalyticsSnapshot[]> {
    return withRetry(() =>
      apiClient.get(
        `/analytics/campaigns/${campaignId}/products/${campaignProductId}/time-series`,
        { params: limit ? { limit } : undefined }
      )
    )
  }

  /** Dự đoán thời điểm hết hàng (linear regression trên snapshots gần nhất). */
  predictStockout(campaignId: string, campaignProductId: string): Promise<StockoutPrediction> {
    return withRetry(() =>
      apiClient.get(
        `/analytics/campaigns/${campaignId}/products/${campaignProductId}/predict-stockout`
      )
    )
  }

  // ─── Fulfillment ──────────────────────────────────────────────────────────

  getFulfillmentByOrderId(orderId: string): Promise<FulfillmentOrder | null> {
    return withRetry(() => apiClient.get(`/fulfillment/orders/${orderId}`))
  }

  getCarriers(): Promise<Carrier[]> {
    return withRetry(() => apiClient.get('/fulfillment/carriers'))
  }

  toggleCarrier(id: string, active: boolean): Promise<Carrier> {
    return apiClient.post(`/fulfillment/carriers/${id}/toggle`, { active })
  }

  updateCarrier(id: string, data: Partial<Pick<Carrier, 'displayName' | 'code' | 'sandboxMode' | 'logoUrl'>>): Promise<Carrier> {
    return apiClient.patch(`/fulfillment/carriers/${id}`, data)
  }

  deleteCarrier(id: string): Promise<{ deleted: boolean }> {
    return apiClient.delete(`/fulfillment/carriers/${id}`)
  }

  getFulfillmentRules(): Promise<FulfillmentRule[]> {
    return withRetry(() => apiClient.get('/fulfillment/rules'))
  }

  createFulfillmentRule(data: {
    name: string
    priority: number
    carrierId: string
    slaHours: number
    minWeightGrams?: number
    maxWeightGrams?: number
    minOrderCents?: number
    maxOrderCents?: number
    destCountry?: string
    destState?: string
  }): Promise<FulfillmentRule> {
    return apiClient.post('/fulfillment/rules', data)
  }

  deleteFulfillmentRule(id: string): Promise<{ success: boolean }> {
    return apiClient.delete(`/fulfillment/rules/${id}`)
  }

  bookLabel(orderId: string, data: { weightGrams?: number; dimensionsCm?: { l: number; w: number; h: number } }): Promise<FulfillmentOrder> {
    return apiClient.post(`/fulfillment/orders/${orderId}/book-label`, data)
  }

  // ─── QC ───────────────────────────────────────────────────────────────────

  getQcStatus(orderId: string): Promise<QcCheckpoint | null> {
    return withRetry(() => apiClient.get(`/fulfillment/qc/${orderId}`))
  }

  listQcCheckpoints(params?: { status?: string; limit?: number; offset?: number }): Promise<{ items: QcCheckpoint[]; total: number }> {
    return withRetry(() => apiClient.get('/fulfillment/qc', { params }))
  }

  initQc(orderId: string): Promise<QcCheckpoint> {
    return apiClient.post(`/fulfillment/qc/${orderId}/init`, {})
  }

  passQc(orderId: string, data: {
    checklist: Array<{ key: string; label: string; passed: boolean | null }>
    weightGrams?: number
    notes?: string
    photoUrls?: string[]
    dimensionsCm?: { l: number; w: number; h: number }
  }): Promise<QcCheckpoint> {
    return apiClient.post(`/fulfillment/qc/${orderId}/pass`, data)
  }

  failQc(orderId: string, data: {
    failReason: string
    checklist: Array<{ key: string; label: string; passed: boolean | null }>
    notes?: string
    photoUrls?: string[]
  }): Promise<QcCheckpoint> {
    return apiClient.post(`/fulfillment/qc/${orderId}/fail`, data)
  }

  reworkQc(orderId: string, note?: string): Promise<QcCheckpoint> {
    return apiClient.post(`/fulfillment/qc/${orderId}/rework`, { note })
  }
}

export const adminService = new AdminService()
