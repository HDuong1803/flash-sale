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
  FraudStats, FraudEvent, IpBlacklistEntry,
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
  
  getUserActionLogs(): Promise<UserActionLog[]> {
    return withRetry(() => apiClient.get('/admin/user-action-logs'))
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
   * Chạy tuần tự nên có thể mất vài giây — không dùng withRetry vì là POST mutation.
   */
  runBenchmarkAll(params: RunBenchmarkParams): Promise<BenchmarkComparison> {
    return apiClient.post('/admin/benchmark/run-all', params)
  }

  /**
   * Chạy benchmark một strategy cụ thể.
   */
  runBenchmarkOne(params: RunBenchmarkParams & { strategy: LockStrategy }): Promise<BenchmarkResult> {
    return apiClient.post('/admin/benchmark/run', params)
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
  getFraudStats(hours = 24): Promise<FraudStats> {
    return withRetry(() => apiClient.get('/admin/fraud/stats', { params: { hours } }))
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
  blacklistIp(ip: string, reason: string, hours?: number): Promise<void> {
    return apiClient.post('/admin/fraud/blacklist', { ip, reason, hours })
  }

  /** Xóa IP khỏi blacklist. */
  removeFromBlacklist(ip: string): Promise<void> {
    return apiClient.delete(`/admin/fraud/blacklist/${ip}`)
  }
}

export const adminService = new AdminService()
