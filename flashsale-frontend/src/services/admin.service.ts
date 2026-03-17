import apiClient, { withRetry } from '@/lib/api-client'
import type { Merchant, Campaign, User, DeadLetterJob, SystemHealth, AdminStats, QueueStats, SystemLog, ActivityLog, OrdersByHour, RevenueTrend } from '@/types'

class AdminService {
  getMerchants(status?: string): Promise<Merchant[]> {
    return withRetry(() => apiClient.get('/admin/merchants', { params: { status } }))
  }
  approveMerchant(id: string): Promise<Merchant> {
    return apiClient.patch(`/admin/merchants/${id}/approve`)
  }
  rejectMerchant(id: string, reason: string): Promise<Merchant> {
    return apiClient.patch(`/admin/merchants/${id}/reject`, { reason })
  }
  getCampaigns(status?: string): Promise<Campaign[]> {
    return withRetry(() => apiClient.get('/admin/campaigns', { params: { status } }))
  }
  approveCampaign(id: string): Promise<Campaign> {
    return apiClient.patch(`/admin/campaigns/${id}/approve`)
  }
  rejectCampaign(id: string, reason: string): Promise<Campaign> {
    return apiClient.patch(`/admin/campaigns/${id}/reject`, { reason })
  }
  getUsers(filters?: { role?: string; search?: string }): Promise<User[]> {
    return withRetry(() => apiClient.get('/admin/users', { params: filters }))
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
  retryJob(id: string): Promise<void> {
    return apiClient.post(`/admin/dead-letter-queue/${id}/retry`)
  }
  discardJob(id: string): Promise<void> {
    return apiClient.delete(`/admin/dead-letter-queue/${id}`)
  }
  getSystemHealth(): Promise<SystemHealth> {
    return withRetry(() => apiClient.get('/admin/system/health'))
  }
  getStats(): Promise<AdminStats> {
    return withRetry(() => apiClient.get('/admin/stats'))
  }
  getOrdersByHour(): Promise<OrdersByHour[]> {
    return withRetry(() => apiClient.get('/admin/stats/orders-by-hour'))
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
}

export const adminService = new AdminService()
