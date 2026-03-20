import { Injectable, NotFoundException } from '@nestjs/common'
import { CampaignStatus, KycStatus, OrderStatus, PaymentStatus, ProductStatus, UserRole, UserStatus } from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import { AdminRepository } from '../repositories/admin.repository'

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService
  ) {}

  // ─── Merchants ──────────────────────────────────────────────────────

  async getMerchants(status?: KycStatus) {
    return this.adminRepository.findMerchants(status)
  }

  async approveMerchant(merchantId: string) {
    const profile = await this.adminRepository.findMerchantById(merchantId)
    if (!profile) throw new NotFoundException('Merchant không tồn tại')
    await this.adminRepository.approveMerchant(merchantId, profile.userId)
    return { success: true }
  }

  async rejectMerchant(merchantId: string, reason: string) {
    const profile = await this.adminRepository.findMerchantById(merchantId)
    if (!profile) throw new NotFoundException('Merchant không tồn tại')
    return this.adminRepository.rejectMerchant(merchantId, reason)
  }

  // ─── Campaigns ──────────────────────────────────────────────────────

  async getCampaigns(status?: CampaignStatus) {
    return this.adminRepository.findCampaigns(status)
  }

  async approveCampaign(campaignId: string) {
    return this.adminRepository.updateCampaignStatus(
      campaignId,
      CampaignStatus.SCHEDULED
    )
  }

  async rejectCampaign(campaignId: string) {
    // Revert to DRAFT so merchant can revise
    return this.adminRepository.updateCampaignStatus(
      campaignId,
      CampaignStatus.DRAFT
    )
  }

  // ─── Users ──────────────────────────────────────────────────────────

  async getUsers(query: {
    role?: UserRole
    search?: string
    page?: number
    limit?: number
  }) {
    return this.adminRepository.findUsers({
      role: query.role,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20
    })
  }

  async suspendUser(userId: string) {
    return this.adminRepository.updateUserStatus(userId, UserStatus.BANNED)
  }

  async activateUser(userId: string) {
    return this.adminRepository.updateUserStatus(userId, UserStatus.ACTIVE)
  }

  // ─── Statistics ─────────────────────────────────────────────────────

  async getStats() {
    return this.adminRepository.getStats()
  }

  async getOrdersByTime(start: Date, end: Date) {
    const rows = await this.adminRepository.getOrdersByTime(start, end)
    return rows.map(r => ({ bucket: r.bucket, orders: Number(r.count) }))
  }

  async getRevenueTrend() {
    const rows = await this.adminRepository.getRevenueTrend()
    return rows.map(({ dayStart, revenue }) => ({
      date: dayStart.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit'
      }),
      revenue
    }))
  }

  async getActivity() {
    const { recentOrders, recentApprovals } =
      await this.adminRepository.getActivity()

    return [
      ...recentOrders.map(o => ({
        type: 'ORDER',
        message: `Đơn hàng mới từ ${o.customer?.fullName ?? 'Khách hàng'}`,
        createdAt: o.createdAt
      })),
      ...recentApprovals.map(m => ({
        type: 'MERCHANT_APPROVED',
        message: `Merchant ${m.businessName} đã được duyệt`,
        createdAt: m.updatedAt
      }))
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
  }

  // ─── Dead Letter Queue ───────────────────────────────────────────────

  async getDeadLetterJobs() {
    return this.adminRepository.findDeadLetterJobs()
  }

  async retryJob(jobId: string) {
    const job = await this.adminRepository.findDeadLetterJobById(jobId)
    if (!job) throw new NotFoundException('Job không tồn tại')

    const queue =
      job.type === 'ORDER_PROCESSING' ? 'order.high' : 'notification'
    await this.rabbitmq.publish(queue, job.payload as object)
    await this.adminRepository.incrementJobRetryCount(jobId)
    return { retried: true }
  }

  async discardJob(jobId: string) {
    const job = await this.adminRepository.findDeadLetterJobById(jobId)
    if (!job) throw new NotFoundException('Job không tồn tại')
    await this.adminRepository.deleteDeadLetterJob(jobId)
    return { discarded: true }
  }

  // ─── System Health ───────────────────────────────────────────────────

  async getSystemHealth() {
    const [postgres, redisOk, rabbitmqOk] = await Promise.all([
      this.adminRepository['prisma'].$queryRaw`SELECT 1`
        .then(() => 'UP')
        .catch(() => 'DOWN'),
      this.redis.client
        .ping()
        .then(() => 'UP')
        .catch(() => 'DOWN'),
      this.rabbitmq.getChannel()
        ? Promise.resolve('UP')
        : Promise.resolve('DOWN')
    ])
    return { postgres, redis: redisOk, rabbitmq: rabbitmqOk, api: 'UP' }
  }

  async getQueueStats() {
    const [high, normal] = await Promise.all([
      this.rabbitmq.getQueueStats('order.high'),
      this.rabbitmq.getQueueStats('order.normal')
    ])
    return { high: high.messageCount, normal: normal.messageCount }
  }

  async getSystemLogs() {
    const logs = await this.redis.client.lrange('system:logs', 0, 49)
    return logs.map(l => JSON.parse(l) as object)
  }

  // ─── Orders ─────────────────────────────────────────────────────────

  async getAdminOrders(status?: OrderStatus) {
    return this.adminRepository.findOrders(status)
  }

  // ─── Payments ────────────────────────────────────────────────────────

  async getAdminPayments(status?: PaymentStatus) {
    return this.adminRepository.findPayments(status)
  }

  // ─── Products ────────────────────────────────────────────────────────

  async getAdminProducts(status?: ProductStatus) {
    return this.adminRepository.findProducts(status)
  }

  // ─── Customer Profiles ───────────────────────────────────────────────

  async getCustomerProfiles() {
    return this.adminRepository.findCustomerProfiles()
  }

  // ─── Notifications ───────────────────────────────────────────────────

  async getAdminNotifications() {
    return this.adminRepository.findNotifications()
  }

  // ─── Stock Audit Logs ────────────────────────────────────────────────

  async getStockAuditLogs() {
    return this.adminRepository.findStockAuditLogs()
  }

  // ─── User Action Logs ────────────────────────────────────────────────

  async getUserActionLogs() {
    return this.adminRepository.findUserActionLogs()
  }

  // ─── Outbox Events ───────────────────────────────────────────────────

  async getOutboxEvents() {
    return this.adminRepository.findOutboxEvents()
  }
}
